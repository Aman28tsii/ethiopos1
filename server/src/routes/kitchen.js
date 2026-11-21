// server/src/routes/kitchen.js

import express from "express";
import { protect, allowKitchen } from "../middleware/auth.js";
import { authorizeBranch, requireCompanyContext } from "../middleware/authorization.js";
import { pool } from "../config/database.js";
import { processOrderStockDeduction } from "../controllers/recipeController.js";

const router = express.Router();

router.use(protect);
router.use(requireCompanyContext);

// ============================================================
// KITCHEN ORDER STATE MACHINE
//
// Legal forward transitions only. Any move not listed here is
// rejected with 409. This closes the "ready → pending" and
// similar reverse-transition gaps found during the audit.
// ============================================================
const ALLOWED_TRANSITIONS = {
    'pending':    ['preparing', 'cancelled'],
    'preparing':  ['ready', 'cancelled'],
    'ready':      ['completed', 'cancelled'],
    'completed':  [],
    'cancelled':  []
};

// ============================================================
// GET KITCHEN ORDERS
// ============================================================
router.get("/orders", authorizeBranch, allowKitchen, async (req, res) => {
    try {
        const branchId = req.user.branch_id;
        const result = await pool.query(`
            SELECT 
                ko.id,
                ko.order_id,
                ko.status,
                ko.notes,
                ko.started_at,
                ko.completed_at,
                ko.created_at,
                o.order_number,
                o.total_amount,
                o.customer_name,
                o.table_id,
                o.source,
                t.table_number,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'name', p.name,
                            'quantity', oi.quantity
                        )
                    ) FILTER (WHERE p.id IS NOT NULL), 
                    '[]'
                ) as items
            FROM kitchen_orders ko
            JOIN orders o ON ko.order_id = o.id
            LEFT JOIN tables t ON o.table_id = t.id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE ko.status IN ('pending', 'preparing')
              AND o.branch_id = $1
            GROUP BY ko.id, o.order_number, o.total_amount, o.customer_name, o.table_id, o.source, ko.status, ko.notes, ko.started_at, ko.completed_at, ko.created_at, t.table_number
            ORDER BY 
                CASE ko.status 
                    WHEN 'pending' THEN 1 
                    WHEN 'preparing' THEN 2 
                    ELSE 3 
                END,
                ko.created_at ASC
        `, [branchId]);
        
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Get kitchen orders error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// UPDATE KITCHEN ORDER STATUS
// ============================================================
router.put("/orders/:orderId/status", authorizeBranch, allowKitchen, async (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body;
    const branchId = req.user.branch_id;
    const companyId = req.user.company_id;

    const validStatuses = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const orderIdInt = parseInt(orderId);
    if (isNaN(orderIdInt)) {
        return res.status(400).json({ success: false, error: 'Invalid order ID' });
    }

    // ── ONE client, ONE transaction for: order check, state transition,
    //    and stock deduction. This is the D14 fix. The FOR UPDATE inside
    //    a real transaction is what serializes concurrent "ready" requests.
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Lock the kitchen order row and validate existence + tenant.
        const orderCheck = await client.query(
            `SELECT ko.id, ko.status
             FROM kitchen_orders ko
             JOIN orders o ON ko.order_id = o.id
             WHERE ko.order_id = $1
               AND o.branch_id = $2
               AND o.company_id = $3
             FOR UPDATE OF ko`,
            [orderIdInt, branchId, companyId]
        );

        if (orderCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: "Order not found in kitchen" });
        }

        // 2. Enforce the state machine.
        const currentStatus = orderCheck.rows[0].status;
        const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
        if (!allowed.includes(status)) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                success: false,
                error: `Invalid transition: ${currentStatus} → ${status}`
            });
        }

        // 3. For 'ready' transitions, check whether stock was already
        //    deducted for this order. Still INSIDE the transaction — a
        //    concurrent request that just committed a deduction will be
        //    visible to us here because we only reach this point AFTER
        //    acquiring the row lock above.
        let alreadyDeducted = false;
        if (status === 'ready') {
            const dedCheck = await client.query(
                `SELECT 1 FROM stock_transactions
                 WHERE order_id = $1 AND transaction_type = 'order_deduction'
                 LIMIT 1`,
                [orderIdInt]
            );
            alreadyDeducted = dedCheck.rows.length > 0;
        }

        // 4. Perform the state transition (kitchen_orders + orders).
        await client.query(
            `UPDATE kitchen_orders
             SET status = $1, updated_at = NOW()
             WHERE order_id = $2`,
            [status, orderIdInt]
        );

        if (status === 'preparing') {
            await client.query(
                `UPDATE kitchen_orders
                 SET started_at = NOW()
                 WHERE order_id = $1 AND started_at IS NULL`,
                [orderIdInt]
            );
        }

        if (status === 'ready' || status === 'completed') {
            await client.query(
                `UPDATE kitchen_orders
                 SET completed_at = NOW()
                 WHERE order_id = $1 AND completed_at IS NULL`,
                [orderIdInt]
            );
        }

        const orderStatus = status === 'pending' ? 'pending' :
                            status === 'preparing' ? 'preparing' :
                            status === 'ready' ? 'ready' :
                            status === 'completed' ? 'completed' : 'cancelled';

        await client.query(
            `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`,
            [orderStatus, orderIdInt]
        );

        // 5. Stock deduction — SAME client, SAME transaction.
        //    If this throws, the whole transaction (including the
        //    status change) rolls back.
        let stockDeductionResult = null;
        if (status === 'ready' && !alreadyDeducted) {
            const itemsRes = await client.query(
                `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
                [orderIdInt]
            );

            stockDeductionResult = await processOrderStockDeduction(
                orderIdInt,
                itemsRes.rows,
                client,
                companyId,
                branchId
            );
            console.log(`[KITCHEN] Stock deducted for order ${orderIdInt}:`,
                stockDeductionResult?.deductions?.length, 'ingredients');
        } else if (status === 'ready' && alreadyDeducted) {
            console.log(`[KITCHEN] Stock already deducted for order ${orderIdInt}, skipping.`);
        }

        // 6. Auto-confirm pickup for cashier-manual orders.
        //    Note: moved INSIDE the transaction so it rolls back with
        //    everything else if the deduction above threw.
        let autoConfirmedCashier = false;
        if (status === 'ready') {
            const autoConfirmResult = await client.query(
                `UPDATE orders
                 SET waiter_confirmed_pickup = true,
                     waiter_pickup_at = NOW(),
                     updated_at = NOW()
                 WHERE id = $1
                   AND (source = 'cashier_manual' OR source = 'cashier')
                 RETURNING id, order_number, table_id, source`,
                [orderIdInt]
            );
            if (autoConfirmResult.rows.length > 0) {
                autoConfirmedCashier = true;
            }
        }

        const result = await client.query(
            `SELECT * FROM kitchen_orders WHERE order_id = $1`,
            [orderIdInt]
        );

        await client.query('COMMIT');

        // 7. Socket emissions — AFTER commit, so clients never see
        //    "ready" for an order whose stock deduction rolled back.
        const io = req.app.get('io');
        if (io) {
            io.to(`branch_${companyId}_${branchId}`).emit('order_status_updated', {
                order_id: orderIdInt,
                status: status,
                order_status: orderStatus
            });

            if (status === 'ready') {
                if (autoConfirmedCashier) {
                    const autoRow = await pool.query(
                        `SELECT id, order_number, table_id FROM orders WHERE id = $1`,
                        [orderIdInt]
                    );
                    const row = autoRow.rows[0];
                    io.to(`cashier_${companyId}_${branchId}`).emit('order_ready_for_cashier', {
                        order_id: orderIdInt,
                        order_number: row?.order_number,
                        table_id: row?.table_id
                    });
                } else {
                    io.to(`waiter_${companyId}_${branchId}`).emit('order_ready_for_waiter', {
                        order_id: orderIdInt,
                        status: 'ready',
                        message: `Order #${orderIdInt} is ready for pickup!`
                    });
                }
            }

            if (status === 'completed') {
                io.to(`branch_${companyId}_${branchId}`).emit('order_completed', {
                    order_id: orderIdInt,
                    status: 'completed'
                });
            }
        }

        return res.json({
            success: true,
            message: `Order status updated to ${status}`,
            data: result.rows[0],
            stock_deduction: stockDeductionResult
                ? {
                    ingredients_deducted: stockDeductionResult.deductions.length,
                    total_wastage_cost: stockDeductionResult.totalWastageCost
                }
                : null
        });
    } catch (err) {
        // Roll back everything — status change, deduction, all of it.
        try { await client.query('ROLLBACK'); } catch (_) { /* connection may already be dead */ }

        console.error("Update kitchen order error:", err);

        // Preserve the specific error contract the original code had
        // for stock-deduction failures.
        if (err.message && /INSUFFICIENT_STOCK|STOCK_CONFLICT|Some ingredients not found|Company or branch context missing/.test(err.message)) {
            return res.status(409).json({
                success: false,
                error: err.message,
                code: 'STOCK_DEDUCTION_FAILED'
            });
        }

        return res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// ============================================================
// GET COMPLETED KITCHEN ORDERS
// ============================================================
router.get("/completed", authorizeBranch, allowKitchen, async (req, res) => {
    try {
        const branchId = req.user.branch_id;
        const { limit = 30 } = req.query;
        
        const result = await pool.query(`
            SELECT 
                ko.order_id,
                ko.status,
                ko.completed_at,
                o.order_number,
                o.total_amount,
                t.table_number,
                o.customer_name
            FROM kitchen_orders ko
            JOIN orders o ON ko.order_id = o.id
            LEFT JOIN tables t ON o.table_id = t.id
            WHERE ko.status IN ('ready', 'completed')
              AND o.branch_id = $1
            ORDER BY ko.completed_at DESC NULLS LAST, ko.updated_at DESC
            LIMIT $2
        `, [branchId, parseInt(limit)]);
        
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Get completed orders error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// GET KITCHEN ORDER DETAILS
// ============================================================
router.get("/orders/:orderId", authorizeBranch, allowKitchen, async (req, res) => {
    const { orderId } = req.params;
    const branchId = req.user.branch_id;
    
    try {
        const result = await pool.query(`
            SELECT 
                ko.*,
                o.order_number,
                o.total_amount,
                o.customer_name,
                o.customer_phone,
                o.notes as order_notes,
                o.table_id,
                t.table_number,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', oi.id,
                            'product_id', oi.product_id,
                            'name', p.name,
                            'quantity', oi.quantity,
                            'unit_price', oi.unit_price,
                            'total_price', oi.total_price
                        )
                    ) FILTER (WHERE p.id IS NOT NULL), 
                    '[]'
                ) as items
            FROM kitchen_orders ko
            JOIN orders o ON ko.order_id = o.id
            LEFT JOIN tables t ON o.table_id = t.id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE ko.order_id = $1 AND o.branch_id = $2
            GROUP BY ko.id, o.order_number, o.total_amount, o.customer_name, o.customer_phone, o.notes, o.table_id, t.table_number
        `, [parseInt(orderId), branchId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Order not found" });
        }
        
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error("Get kitchen order details error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// BULK UPDATE ORDER STATUS
// ============================================================
router.put("/orders/bulk-status", authorizeBranch, allowKitchen, async (req, res) => {
    const { orderIds, status } = req.body;
    const branchId = req.user.branch_id;
    const companyId = req.user.company_id;
    
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ 
            success: false, 
            error: "orderIds array is required" 
        });
    }

    const validStatuses = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ 
            success: false, 
            error: 'Invalid status' 
        });
    }

    const results = [];
    const stockErrors = [];

    for (const orderId of orderIds) {
        const orderIdInt = parseInt(orderId);
        if (isNaN(orderIdInt)) continue;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Lock and validate tenant ownership (D15-B: Tenant Isolation)
            const orderCheck = await client.query(
                `SELECT ko.id, ko.status, o.company_id, o.branch_id
                 FROM kitchen_orders ko
                 JOIN orders o ON ko.order_id = o.id
                 WHERE ko.order_id = $1
                   AND o.company_id = $2
                   AND o.branch_id = $3
                 FOR UPDATE OF ko`,
                [orderIdInt, companyId, branchId]
            );

            if (orderCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                console.warn(`[KITCHEN BULK] Order ${orderIdInt} not found or tenant mismatch`);
                continue; // Skip this order, don't fail the whole batch
            }

            // 2. Enforce the state machine
            const currentStatus = orderCheck.rows[0].status;
            const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
            if (!allowed.includes(status)) {
                await client.query('ROLLBACK');
                console.warn(`[KITCHEN BULK] Invalid transition for order ${orderIdInt}: ${currentStatus} → ${status}`);
                continue;
            }

            // 3. Check deduction status INSIDE the transaction (D15-A: Concurrency)
            let alreadyDeducted = false;
            if (status === 'ready') {
                const dedCheck = await client.query(
                    `SELECT 1 FROM stock_transactions
                     WHERE order_id = $1 AND transaction_type = 'order_deduction'
                     LIMIT 1`,
                    [orderIdInt]
                );
                alreadyDeducted = dedCheck.rows.length > 0;
            }

            // 4. Perform state transitions
            await client.query(
                `UPDATE kitchen_orders 
                 SET status = $1, updated_at = NOW() 
                 WHERE order_id = $2`,
                [status, orderIdInt]
            );

            if (status === 'preparing') {
                await client.query(
                    `UPDATE kitchen_orders 
                     SET started_at = NOW() 
                     WHERE order_id = $1 AND started_at IS NULL`,
                    [orderIdInt]
                );
            }

            if (status === 'ready' || status === 'completed') {
                await client.query(
                    `UPDATE kitchen_orders 
                     SET completed_at = NOW() 
                     WHERE order_id = $1 AND completed_at IS NULL`,
                    [orderIdInt]
                );
            }

            const orderStatus = status === 'pending' ? 'pending' : 
                               status === 'preparing' ? 'preparing' : 
                               status === 'ready' ? 'ready' : 
                               status === 'completed' ? 'completed' : 'cancelled';

            await client.query(
                "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2",
                [orderStatus, orderIdInt]
            );

            // 5. Stock deduction (inside the same transaction)
            if (status === 'ready' && !alreadyDeducted) {
                const itemsRes = await client.query(
                    `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
                    [orderIdInt]
                );
                await processOrderStockDeduction(
                    orderIdInt,
                    itemsRes.rows,
                    client,
                    companyId,
                    branchId
                );
            }

            // 6. Auto-confirm pickup for cashier-manual orders
            if (status === 'ready') {
                await client.query(
                    `UPDATE orders
                     SET waiter_confirmed_pickup = true,
                         waiter_pickup_at = NOW(),
                         updated_at = NOW()
                     WHERE id = $1
                       AND (source = 'cashier_manual' OR source = 'cashier')`,
                    [orderIdInt]
                );
            }

            await client.query('COMMIT');
            results.push({ order_id: orderIdInt, status: status });

        } catch (err) {
            await client.query('ROLLBACK');
            console.error(`[KITCHEN BULK] Failed for order ${orderIdInt}:`, err.message);
            
            if (err.message && /INSUFFICIENT_STOCK|STOCK_CONFLICT|Some ingredients not found|Company or branch context missing/.test(err.message)) {
                stockErrors.push({
                    order_id: orderIdInt,
                    error: err.message
                });
            }
        } finally {
            client.release();
        }
    }

    const io = req.app.get('io');
    if (io && results.length > 0) {
        const orderStatus = status === 'pending' ? 'pending' : 
                           status === 'preparing' ? 'preparing' : 
                           status === 'ready' ? 'ready' : 
                           status === 'completed' ? 'completed' : 'cancelled';

        io.to(`branch_${companyId}_${branchId}`).emit('order_status_updated', {
            order_ids: results.map(r => r.order_id),
            status: status,
            order_status: orderStatus
        });

        if (status === 'ready') {
            const checkResult = await pool.query(
                `SELECT id, order_number, table_id, source,
                        waiter_confirmed_pickup
                 FROM orders
                 WHERE id = ANY($1::int[])`,
                [results.map(r => r.order_id)]
            );

            for (const row of checkResult.rows) {
                if (row.source === 'cashier_manual' || row.source === 'cashier') {
                    io.to(`cashier_${companyId}_${branchId}`).emit('order_ready_for_cashier', {
                        order_id: row.id,
                        order_number: row.order_number,
                        table_id: row.table_id
                    });
                } else {
                    io.to(`waiter_${companyId}_${branchId}`).emit('order_ready_for_waiter', {
                        order_id: row.id,
                        status: 'ready',
                        message: `Order #${row.id} is ready for pickup!`
                    });
                }
            }
        }

        if (status === 'completed') {
            results.forEach(r => {
                io.to(`branch_${companyId}_${branchId}`).emit('order_completed', {
                    order_id: r.order_id,
                    status: 'completed'
                });
            });
        }
    }

    res.json({
        success: true,
        message: `Processed ${results.length} orders. ${stockErrors.length > 0 ? `${stockErrors.length} failed.` : ''}`,
        data: results,
        stock_errors: stockErrors.length > 0 ? stockErrors : undefined
    });
});

// ============================================================
// GET KITCHEN STATS
// ============================================================
router.get("/stats", authorizeBranch, allowKitchen, async (req, res) => {
    try {
        const branchId = req.user.branch_id;
        
        const result = await pool.query(`
            SELECT 
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
                COUNT(CASE WHEN status = 'preparing' THEN 1 END) as preparing_count,
                COUNT(CASE WHEN status = 'ready' THEN 1 END) as ready_count,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
                COUNT(*) as total_count,
                AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_prep_time_seconds,
                MAX(EXTRACT(EPOCH FROM (completed_at - started_at))) as max_prep_time_seconds,
                MIN(EXTRACT(EPOCH FROM (completed_at - started_at))) as min_prep_time_seconds
            FROM kitchen_orders ko
            JOIN orders o ON ko.order_id = o.id
            WHERE o.branch_id = $1
              AND ko.created_at >= NOW() - INTERVAL '24 hours'
        `, [branchId]);
        
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error("Get kitchen stats error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;