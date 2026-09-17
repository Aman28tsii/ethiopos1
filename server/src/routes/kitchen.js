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
    
    try {
        const validStatuses = ['pending', 'preparing', 'ready', 'completed', 'cancelled'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid status' 
            });
        }

        const orderIdInt = parseInt(orderId);
        if (isNaN(orderIdInt)) {
            return res.status(400).json({ success: false, error: 'Invalid order ID' });
        }

        const orderCheck = await pool.query(
            `SELECT id FROM kitchen_orders WHERE order_id = $1`,
            [orderIdInt]
        );
        
        if (orderCheck.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Order not found in kitchen" });
        }

        await pool.query(
            `UPDATE kitchen_orders 
             SET status = $1, updated_at = NOW() 
             WHERE order_id = $2`,
            [status, orderIdInt]
        );

        if (status === 'preparing') {
            await pool.query(
                `UPDATE kitchen_orders 
                 SET started_at = NOW() 
                 WHERE order_id = $1 AND started_at IS NULL`,
                [orderIdInt]
            );
        }

        if (status === 'ready' || status === 'completed') {
            await pool.query(
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

        await pool.query(
            "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2",
            [orderStatus, orderIdInt]
        );

        // ============================================================
        // STOCK DEDUCTION happens HERE, when food leaves the kitchen.
        // Guard: only deduct once per order, even if the kitchen clicks
        // "ready" multiple times. We use the stock_transactions table as
        // the source of truth for "was this order already deducted?".
        // ============================================================
        let stockDeductionResult = null;

        if (status === 'ready') {
            const alreadyDeducted = await pool.query(
                `SELECT 1 FROM stock_transactions
                 WHERE order_id = $1 AND transaction_type = 'order_deduction'
                 LIMIT 1`,
                [orderIdInt]
            );

            if (alreadyDeducted.rows.length === 0) {
                const itemsRes = await pool.query(
                    `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
                    [orderIdInt]
                );

                const client = await pool.connect();
                try {
                    await client.query('BEGIN');
                    stockDeductionResult = await processOrderStockDeduction(
                        orderIdInt,
                        itemsRes.rows,
                        client,
                        companyId,
                        branchId
                    );
                    await client.query('COMMIT');
                    console.log(`[KITCHEN] Stock deducted for order ${orderIdInt}:`,
                        stockDeductionResult?.deductions?.length, 'ingredients');
                } catch (deductErr) {
                    await client.query('ROLLBACK');
                    console.error(`[KITCHEN] Stock deduction FAILED for order ${orderIdInt}:`, deductErr.message);

                    // Roll back the "ready" status so the kitchen can retry
                    await pool.query(
                        `UPDATE kitchen_orders SET status = 'preparing', updated_at = NOW() WHERE order_id = $1`,
                        [orderIdInt]
                    );
                    await pool.query(
                        `UPDATE orders SET status = 'preparing', updated_at = NOW() WHERE id = $1`,
                        [orderIdInt]
                    );

                    return res.status(409).json({
                        success: false,
                        error: deductErr.message || 'Insufficient stock to complete this order',
                        code: 'STOCK_DEDUCTION_FAILED'
                    });
                } finally {
                    client.release();
                }
            } else {
                console.log(`[KITCHEN] Stock already deducted for order ${orderIdInt}, skipping.`);
            }
        }

        // AUTO-CONFIRM PICKUP FOR CASHIER-MANUAL ORDERS ONLY.
        let autoConfirmedCashier = false;
        if (status === 'ready') {
            const autoConfirmResult = await pool.query(
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

        const result = await pool.query(
            `SELECT * FROM kitchen_orders WHERE order_id = $1`,
            [orderIdInt]
        );

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

        res.json({
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
        console.error("Update kitchen order error:", err);
        res.status(500).json({ success: false, error: err.message });
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

    try {
        const results = [];
        const stockErrors = [];

        for (const orderId of orderIds) {
            const orderIdInt = parseInt(orderId);
            if (isNaN(orderIdInt)) continue;

            if (status === 'ready') {
                const alreadyDeducted = await pool.query(
                    `SELECT 1 FROM stock_transactions
                     WHERE order_id = $1 AND transaction_type = 'order_deduction'
                     LIMIT 1`,
                    [orderIdInt]
                );

                if (alreadyDeducted.rows.length === 0) {
                    const itemsRes = await pool.query(
                        `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
                        [orderIdInt]
                    );

                    const client = await pool.connect();
                    try {
                        await client.query('BEGIN');
                        await processOrderStockDeduction(
                            orderIdInt,
                            itemsRes.rows,
                            client,
                            companyId,
                            branchId
                        );
                        await client.query('COMMIT');
                    } catch (deductErr) {
                        await client.query('ROLLBACK');
                        console.error(`[KITCHEN BULK] Stock deduction failed for order ${orderIdInt}:`, deductErr.message);
                        stockErrors.push({
                            order_id: orderIdInt,
                            error: deductErr.message
                        });
                        continue;
                    } finally {
                        client.release();
                    }
                }
            }
            
            await pool.query(
                `UPDATE kitchen_orders 
                 SET status = $1, updated_at = NOW() 
                 WHERE order_id = $2`,
                [status, orderIdInt]
            );

            if (status === 'preparing') {
                await pool.query(
                    `UPDATE kitchen_orders 
                     SET started_at = NOW() 
                     WHERE order_id = $1 AND started_at IS NULL`,
                    [orderIdInt]
                );
            }

            if (status === 'ready' || status === 'completed') {
                await pool.query(
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

            await pool.query(
                "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2",
                [orderStatus, orderIdInt]
            );

            if (status === 'ready') {
                await pool.query(
                    `UPDATE orders
                     SET waiter_confirmed_pickup = true,
                         waiter_pickup_at = NOW(),
                         updated_at = NOW()
                     WHERE id = $1
                       AND (source = 'cashier_manual' OR source = 'cashier')`,
                    [orderIdInt]
                );
            }

            results.push({ order_id: orderIdInt, status: status });
        }

        const io = req.app.get('io');
        if (io) {
            io.to(`branch_${companyId}_${branchId}`).emit('order_status_updated', {
                order_ids: results.map(r => r.order_id),
                status: status,
                order_status: status === 'pending' ? 'pending' : 
                             status === 'preparing' ? 'preparing' : 
                             status === 'ready' ? 'ready' : 
                             status === 'completed' ? 'completed' : 'cancelled'
            });

            if (status === 'ready' && results.length > 0) {
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
            message: `Updated ${results.length} orders to ${status}`,
            data: results,
            stock_errors: stockErrors.length > 0 ? stockErrors : undefined
        });
    } catch (err) {
        console.error("Bulk update error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
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