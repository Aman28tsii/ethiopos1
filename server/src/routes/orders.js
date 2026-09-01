// server/src/routes/orders.js

import express from "express";
import { protect, allowWaiter, allowCashier } from "../middleware/auth.js";
import { authorizeBranch, requireCompanyContext } from "../middleware/authorization.js";
import { idempotent, requireIdempotency } from "../middleware/idempotency.js";
import { pool } from "../config/database.js";
import rateLimit from "express-rate-limit";
import { processOrderStockDeduction } from "../controllers/recipeController.js";

const router = express.Router();

const trackLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { success: false, error: "Too many requests. Please wait." }
});

const generateSaleNumber = () => {
    const date = new Date();
    const timestamp = date.getTime().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
    return `SALE-${timestamp}${random}`;
};

const generateOrderNumber = () => {
    const date = new Date();
    const timestamp = date.getTime().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
    return `ORD-${timestamp}${random}`;
};

// ============================================================
// PUBLIC ROUTES
// ============================================================

router.get("/track/:orderNumber", trackLimiter, async (req, res) => {
    const { orderNumber } = req.params;
    try {
        const orderResult = await pool.query(`
            SELECT o.id, o.order_number, o.total_amount, o.status, o.payment_status, 
                   o.customer_name, o.customer_phone, o.table_id, o.order_type, o.notes,
                   o.created_at, o.updated_at, o.waiter_id, o.confirmed_at,
                   o.company_id, o.branch_id,
                   t.table_number
            FROM orders o
            LEFT JOIN tables t ON o.table_id = t.id
            WHERE o.order_number = $1
        `, [orderNumber]);
        
        if (orderResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Order not found" });
        }
        
        const order = orderResult.rows[0];
        const itemsResult = await pool.query(`
            SELECT oi.id, oi.product_id, oi.quantity, oi.unit_price, oi.total_price,
                   p.name as product_name
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = $1
        `, [order.id]);
        
        res.json({ success: true, data: { ...order, items: itemsResult.rows } });
    } catch (err) {
        console.error("Track order error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post("/qr-order", requireIdempotency, idempotent, async (req, res) => {
    try {
        const { items, table_id, customer_name, customer_phone, notes } = req.body;
        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, error: "No items in order" });
        }
        
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            
            const tableResult = await client.query(
                "SELECT branch_id, waiter_id FROM tables WHERE id = $1",
                [table_id]
            );
            if (tableResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: "Table not found" });
            }
            const branchId = tableResult.rows[0].branch_id;
            const waiterId = tableResult.rows[0].waiter_id;
            
            const branchResult = await client.query(
                "SELECT company_id FROM branches WHERE id = $1",
                [branchId]
            );
            const companyId = branchResult.rows[0].company_id;
            
            let totalAmount = 0;
            for (const item of items) {
                const productResult = await client.query(
                    "SELECT price, company_id FROM products WHERE id = $1",
                    [item.product_id]
                );
                if (productResult.rows[0].company_id !== companyId) {
                    throw new Error(`Product ${item.product_id} does not belong to this company`);
                }
                totalAmount += parseFloat(productResult.rows[0].price) * item.quantity;
            }
            
            const orderNumber = `QR-${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 1000)}`;
            
            const orderResult = await client.query(`
                INSERT INTO orders (
                    order_number, total_amount, status, payment_status, 
                    customer_name, customer_phone, table_id, order_type, notes, source, waiter_id,
                    company_id, branch_id
                ) VALUES ($1, $2, 'pending_confirmation', 'pending', $3, $4, $5, 'dine_in', $6, 'qr_menu', $7, $8, $9)
                RETURNING id, order_number
            `, [orderNumber, totalAmount, customer_name || null, customer_phone || null, table_id || null, notes || null, waiterId, companyId, branchId]);
            
            const orderId = orderResult.rows[0].id;
            
            for (const item of items) {
                const productResult = await client.query(
                    "SELECT price, name FROM products WHERE id = $1",
                    [item.product_id]
                );
                const itemTotal = parseFloat(productResult.rows[0].price) * item.quantity;
                await client.query(`
                    INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price)
                    VALUES ($1, $2, $3, $4, $5)
                `, [orderId, item.product_id, item.quantity, productResult.rows[0].price, itemTotal]);
            }
            
            await client.query("COMMIT");
            
            res.status(201).json({
                success: true,
                message: "Order placed! Waiting for waiter confirmation.",
                data: { order_id: orderId, order_number: orderNumber, total_amount: totalAmount, status: 'pending_confirmation' }
            });
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error("QR order error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// PROTECTED ROUTES
// ============================================================
router.use(protect);
router.use(requireCompanyContext);

// ============================================================
// WAITER ROUTES
// ============================================================

router.get("/", authorizeBranch, allowWaiter, async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const branchId = req.user.branch_id;
        const { status, limit = 50, offset = 0 } = req.query;
        
        let queryStr = `
            SELECT o.*, t.table_number, u.name as created_by_name
            FROM orders o
            LEFT JOIN tables t ON o.table_id = t.id
            LEFT JOIN users u ON o.created_by = u.id
            WHERE o.company_id = $1 AND o.branch_id = $2
        `;
        const params = [companyId, branchId];
        let paramIndex = 3;
        
        if (status) {
            queryStr += ` AND o.status = $${paramIndex++}`;
            params.push(status);
        }
        
        queryStr += ` ORDER BY o.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(parseInt(limit), parseInt(offset));
        
        const result = await pool.query(queryStr, params);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Get orders error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post("/", authorizeBranch, allowWaiter, requireIdempotency, idempotent, async (req, res) => {
    try {
        const { items, customer_name, customer_phone, table_id, order_type = 'dine_in', notes, source = 'waiter' } = req.body;
        const userId = req.user.id;
        const companyId = req.user.company_id;
        const branchId = req.user.branch_id;
        
        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, error: "Order must have at least one item" });
        }
        
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            
            if (table_id) {
                const tableCheck = await client.query(
                    "SELECT id FROM tables WHERE id = $1 AND branch_id = $2 AND company_id = $3",
                    [table_id, branchId, companyId]
                );
                if (tableCheck.rows.length === 0) {
                    return res.status(404).json({ success: false, error: "Table not found in this branch" });
                }
            }
            
            let totalAmount = 0;
            for (const item of items) {
                const productResult = await client.query(
                    "SELECT price, company_id FROM products WHERE id = $1",
                    [item.product_id]
                );
                if (productResult.rows[0].company_id !== companyId) {
                    throw new Error(`Product ${item.product_id} does not belong to this company`);
                }
                totalAmount += parseFloat(productResult.rows[0].price) * item.quantity;
            }
            
            const orderNumber = generateOrderNumber();
            
            const orderResult = await client.query(`
                INSERT INTO orders (
                    order_number, total_amount, created_by, status, payment_status, 
                    customer_name, customer_phone, table_id, order_type, notes, source, waiter_id,
                    company_id, branch_id
                ) VALUES ($1, $2, $3, 'pending', 'pending', $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING id, order_number, total_amount
            `, [orderNumber, totalAmount, userId, customer_name || null, customer_phone || null, table_id || null, order_type, notes || null, source, userId, companyId, branchId]);
            
            const orderId = orderResult.rows[0].id;
            
            for (const item of items) {
                const productResult = await client.query(
                    "SELECT price FROM products WHERE id = $1",
                    [item.product_id]
                );
                const itemTotal = parseFloat(productResult.rows[0].price) * item.quantity;
                await client.query(`
                    INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price)
                    VALUES ($1, $2, $3, $4, $5)
                `, [orderId, item.product_id, item.quantity, productResult.rows[0].price, itemTotal]);
            }
            
            await client.query(`
                INSERT INTO kitchen_orders (order_id, status, notes)
                VALUES ($1, 'pending', $2)
            `, [orderId, notes || null]);
            
            if (table_id && order_type === 'dine_in') {
                await client.query(`
                    UPDATE tables SET status = 'occupied', current_order_id = $1 WHERE id = $2
                `, [orderId, table_id]);
            }
            
            let stockResult = { deductions: [], totalWastageCost: 0 };
            try {
                stockResult = await processOrderStockDeduction(orderId, items, client);
            } catch (stockError) {
                console.warn("Stock deduction warning:", stockError.message);
            }
            
            await client.query("COMMIT");
            
            const io = req.app.get('io');
            if (io) {
                const orderData = {
                    order_id: orderId,
                    order_number: orderNumber,
                    total_amount: totalAmount,
                    status: 'pending',
                    branch_id: branchId,
                    company_id: companyId,
                    created_by: userId
                };
                
                io.to(`kitchen_${branchId}`).emit('new_order', orderData);
                io.to(`branch_${companyId}_${branchId}`).emit('new_order_branch', orderData);
            }
            
            res.status(201).json({
                success: true,
                message: "Order created and sent to kitchen",
                data: { 
                    order_id: orderId, 
                    order_number: orderNumber, 
                    total_amount: totalAmount, 
                    stock_deductions: stockResult.deductions, 
                    total_wastage_cost: stockResult.totalWastageCost 
                }
            });
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error("Create order error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get("/:orderId", authorizeBranch, allowWaiter, async (req, res) => {
    const { orderId } = req.params;
    const branchId = req.user.branch_id;
    const companyId = req.user.company_id;
    
    try {
        const result = await pool.query(`
            SELECT o.*, t.table_number, u.name as created_by_name
            FROM orders o
            LEFT JOIN tables t ON o.table_id = t.id
            LEFT JOIN users u ON o.created_by = u.id
            WHERE o.id = $1 AND o.company_id = $2 AND o.branch_id = $3
        `, [orderId, companyId, branchId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Order not found" });
        }
        
        const items = await pool.query(`
            SELECT oi.*, p.name as product_name
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = $1
        `, [orderId]);
        
        res.json({ 
            success: true, 
            data: { ...result.rows[0], items: items.rows } 
        });
    } catch (err) {
        console.error("Get order error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post("/:orderId/add-items", authorizeBranch, allowWaiter, async (req, res) => {
    const { orderId } = req.params;
    const { items } = req.body;
    const branchId = req.user.branch_id;
    const companyId = req.user.company_id;
    
    if (!items || items.length === 0) {
        return res.status(400).json({ success: false, error: "No items to add" });
    }
    
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        
        const orderCheck = await client.query(
            "SELECT status, payment_status, total_amount FROM orders WHERE id = $1 AND branch_id = $2 AND company_id = $3",
            [orderId, branchId, companyId]
        );
        
        if (orderCheck.rows.length === 0) {
            throw new Error("Order not found");
        }
        const order = orderCheck.rows[0];
        if (order.payment_status === 'paid') {
            throw new Error("Cannot add items to a paid order");
        }
        if (order.status === 'completed') {
            throw new Error("Order already completed");
        }
        
        let additionalAmount = 0;
        const newItems = [];
        
        for (const item of items) {
            const productResult = await client.query(
                "SELECT price, company_id, name FROM products WHERE id = $1",
                [item.product_id]
            );
            if (productResult.rows[0].company_id !== companyId) {
                throw new Error(`Product ${item.product_id} does not belong to this company`);
            }
            const unitPrice = parseFloat(productResult.rows[0].price);
            const itemTotal = unitPrice * item.quantity;
            additionalAmount += itemTotal;
            await client.query(`
                INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price)
                VALUES ($1, $2, $3, $4, $5)
            `, [orderId, item.product_id, item.quantity, unitPrice, itemTotal]);
            newItems.push(item);
        }
        
        const newTotal = parseFloat(order.total_amount) + additionalAmount;
        await client.query(`
            UPDATE orders SET total_amount = $1, updated_at = NOW() WHERE id = $2
        `, [newTotal, orderId]);
        
        let stockResult = { deductions: [], totalWastageCost: 0 };
        try {
            stockResult = await processOrderStockDeduction(orderId, newItems, client);
        } catch (stockError) {
            console.warn("Stock deduction warning:", stockError.message);
        }
        
        await client.query("COMMIT");
        res.json({
            success: true,
            message: "Items added to order",
            additional_amount: additionalAmount,
            new_total: newTotal,
            stock_deductions: stockResult.deductions,
            total_wastage_cost: stockResult.totalWastageCost
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Add items error:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

router.put("/:orderId/cancel", authorizeBranch, allowWaiter, async (req, res) => {
    const { orderId } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;
    const branchId = req.user.branch_id;
    const companyId = req.user.company_id;
    
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const orderCheck = await client.query(
            "SELECT status, payment_status, table_id FROM orders WHERE id = $1 AND waiter_id = $2 AND branch_id = $3 AND company_id = $4",
            [orderId, userId, branchId, companyId]
        );
        if (orderCheck.rows.length === 0) {
            throw new Error("Order not found or does not belong to you");
        }
        const order = orderCheck.rows[0];
        if (order.payment_status === 'paid') {
            throw new Error("Cannot cancel a paid order.");
        }
        
        await client.query(`
            UPDATE orders SET status = 'cancelled', updated_at = NOW(), cancellation_reason = $1
            WHERE id = $2
        `, [reason || "Cancelled by staff", orderId]);
        await client.query(`
            UPDATE kitchen_orders SET status = 'cancelled', updated_at = NOW()
            WHERE order_id = $1
        `, [orderId]);
        if (order.table_id) {
            await client.query(`
                UPDATE tables SET status = 'available', current_order_id = NULL, pending_order_id = NULL, updated_at = NOW()
                WHERE id = $1
            `, [order.table_id]);
        }
        await client.query("COMMIT");
        res.json({ success: true, message: "Order cancelled successfully", data: { order_id: orderId } });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Cancel order error:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

router.put("/confirm/:orderId", authorizeBranch, allowWaiter, async (req, res) => {
    const { orderId } = req.params;
    const userId = req.user.id;
    const branchId = req.user.branch_id;
    const companyId = req.user.company_id;
    
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const orderCheck = await client.query(
            `SELECT o.id, o.status, o.table_id, o.customer_name, o.order_number, o.waiter_id
             FROM orders o
             WHERE o.id = $1 AND o.status = 'pending_confirmation' AND o.branch_id = $2 AND o.company_id = $3`,
            [orderId, branchId, companyId]
        );
        if (orderCheck.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Order not found or already confirmed" });
        }
        const order = orderCheck.rows[0];
        if (!order.waiter_id) {
            await client.query("UPDATE orders SET waiter_id = $1 WHERE id = $2", [userId, orderId]);
            order.waiter_id = userId;
        }
        if (order.waiter_id && order.waiter_id !== userId) {
            return res.status(403).json({ success: false, error: "This order is not assigned to you" });
        }
        await client.query(`
            UPDATE orders 
            SET status = 'pending', confirmed_by = $1, confirmed_at = NOW(), updated_at = NOW()
            WHERE id = $2
        `, [userId, orderId]);
        await client.query(`
            INSERT INTO kitchen_orders (order_id, status, notes)
            VALUES ($1, 'pending', $2)
        `, [orderId, "Order confirmed by waiter"]);
        if (order.table_id) {
            await client.query(`
                UPDATE tables 
                SET status = 'occupied', current_order_id = $1, pending_order_id = NULL, updated_at = NOW()
                WHERE id = $2
            `, [orderId, order.table_id]);
        }
        await client.query("COMMIT");
        res.json({ success: true, message: "Order confirmed and sent to kitchen", data: { order_id: orderId, status: 'pending' } });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Confirm order error:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

router.get("/pending-confirmation", authorizeBranch, allowWaiter, async (req, res) => {
    const waiterId = req.user.id;
    const branchId = req.user.branch_id;
    const companyId = req.user.company_id;
    try {
        const result = await pool.query(`
            SELECT o.id, o.order_number, o.total_amount, o.customer_name, o.customer_phone, 
                   o.table_id, o.notes, o.created_at, o.status,
                   t.table_number,
                   COALESCE(
                       json_agg(
                           json_build_object(
                               "name", p.name,
                               "quantity", oi.quantity,
                               "price", oi.unit_price
                           )
                       ) FILTER (WHERE p.id IS NOT NULL), 
                       '[]'
                   ) as items
            FROM orders o
            JOIN tables t ON o.table_id = t.id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE o.status = 'pending_confirmation' 
              AND o.branch_id = $1
              AND o.company_id = $2
              AND (o.waiter_id = $3 OR o.waiter_id IS NULL)
              AND o.source = 'qr_menu'
            GROUP BY o.id, t.table_number
            ORDER BY o.created_at ASC
        `, [branchId, companyId, waiterId]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Get pending confirmations error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get("/my-orders", authorizeBranch, allowWaiter, async (req, res) => {
    const userId = req.user.id;
    const branchId = req.user.branch_id;
    const companyId = req.user.company_id;
    try {
        const result = await pool.query(`
            SELECT o.id, o.order_number, o.total_amount, o.status, o.payment_status,
                   o.customer_name, o.table_id, o.created_at,
                   t.table_number,
                   COALESCE(
                       json_agg(
                           json_build_object(
                               "name", p.name,
                               "quantity", oi.quantity,
                               "price", oi.unit_price
                           )
                       ) FILTER (WHERE p.id IS NOT NULL), 
                       '[]'
                   ) as items
            FROM orders o
            JOIN tables t ON o.table_id = t.id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE o.waiter_id = $1
              AND o.branch_id = $2
              AND o.company_id = $3
              AND o.status NOT IN ('completed', 'cancelled', 'pending_confirmation')
            GROUP BY o.id, t.table_number
            ORDER BY o.created_at DESC
        `, [userId, branchId, companyId]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Get waiter orders error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// CASHIER ROUTES - FIXED
// ============================================================

// GET READY ORDERS - SIMPLE VERSION
router.get("/ready", protect, async (req, res) => {
    try {
        const branchId = req.user.branch_id;
        const companyId = req.user.company_id;
        
        console.log("[READY] Fetching orders for branch:", branchId, "company:", companyId);
        
        const result = await pool.query(`
            SELECT 
                o.id, 
                o.order_number, 
                o.total_amount, 
                o.customer_name, 
                o.table_id,
                t.table_number, 
                o.created_at,
                o.status
            FROM orders o
            LEFT JOIN tables t ON o.table_id = t.id
            WHERE o.payment_status = 'pending'
                AND o.status = 'pending'
                AND o.branch_id = $1
                AND o.company_id = $2
            ORDER BY o.created_at ASC
        `, [branchId, companyId]);
        
        console.log("[READY] Found", result.rows.length, "orders");
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("[READY] Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post("/:orderId/pay", authorizeBranch, allowCashier, requireIdempotency, idempotent, async (req, res) => {
    const { orderId } = req.params;
    const { payment_method } = req.body;
    const branchId = req.user.branch_id;
    const companyId = req.user.company_id;
    
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const orderResult = await client.query(`
            SELECT o.*, ko.status as kitchen_status 
            FROM orders o
            JOIN kitchen_orders ko ON o.id = ko.order_id
            WHERE o.id = $1 AND o.branch_id = $2 AND o.company_id = $3
        `, [orderId, branchId, companyId]);
        if (orderResult.rows.length === 0) {
            throw new Error("Order not found");
        }
        const order = orderResult.rows[0];
        if (order.kitchen_status !== 'ready') {
            throw new Error("Order is not ready for payment");
        }
        if (order.payment_status === 'paid') {
            throw new Error("Order already paid");
        }
        await client.query(`
            UPDATE orders 
            SET payment_status = 'paid', payment_method = $1, status = 'completed', updated_at = NOW()
            WHERE id = $2
        `, [payment_method, orderId]);
        if (order.table_id) {
            await client.query(`
                UPDATE tables 
                SET status = 'available', current_order_id = NULL, updated_at = NOW()
                WHERE id = $1
            `, [order.table_id]);
        }
        const saleNumber = generateSaleNumber();
        await client.query(`
            INSERT INTO sales (sale_number, order_id, total_amount, payment_method, status, branch_id, company_id, created_at)
            VALUES ($1, $2, $3, $4, 'completed', $5, $6, NOW())
        `, [saleNumber, orderId, order.total_amount, payment_method, branchId, companyId]);
        await client.query("COMMIT");
        res.json({ success: true, message: "Payment processed successfully", data: { sale_number: saleNumber, order_id: orderId, total_amount: order.total_amount } });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Payment error:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// ============================================================
// UTILITY ROUTES
// ============================================================

router.get("/table/:tableId/active-order", authorizeBranch, allowWaiter, async (req, res) => {
    const { tableId } = req.params;
    const branchId = req.user.branch_id;
    const companyId = req.user.company_id;
    try {
        const result = await pool.query(`
            SELECT id, order_number, total_amount, status, payment_status, created_at
            FROM orders 
            WHERE table_id = $1 AND branch_id = $2 AND company_id = $3
              AND status NOT IN ('completed', 'cancelled')
              AND payment_status != 'paid'
            ORDER BY created_at DESC 
            LIMIT 1
        `, [tableId, branchId, companyId]);
        res.json({ success: true, data: result.rows[0] || null });
    } catch (err) {
        console.error("Get active order error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post("/:orderId/customer-add-items", async (req, res) => {
    const { orderId } = req.params;
    const { items } = req.body;
    if (!items || items.length === 0) {
        return res.status(400).json({ success: false, error: "No items to add" });
    }
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        
        const orderCheck = await client.query(
            "SELECT id, status, total_amount, company_id FROM orders WHERE id = $1 AND status = $2",
            [orderId, 'pending_confirmation']
        );
        if (orderCheck.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Order not found or already confirmed" });
        }
        const order = orderCheck.rows[0];
        const companyId = order.company_id;
        
        let additionalAmount = 0;
        for (const item of items) {
            const productResult = await client.query(
                "SELECT price, company_id, name FROM products WHERE id = $1",
                [item.product_id]
            );
            if (productResult.rows[0].company_id !== companyId) {
                throw new Error(`Product ${item.product_id} does not belong to this company`);
            }
            const unitPrice = parseFloat(productResult.rows[0].price);
            const itemTotal = unitPrice * item.quantity;
            additionalAmount += itemTotal;
            await client.query(`
                INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price)
                VALUES ($1, $2, $3, $4, $5)
            `, [orderId, item.product_id, item.quantity, unitPrice, itemTotal]);
        }
        const newTotal = parseFloat(order.total_amount) + additionalAmount;
        await client.query(`
            UPDATE orders SET total_amount = $1, updated_at = NOW() WHERE id = $2
        `, [newTotal, orderId]);
        await client.query("COMMIT");
        res.json({ success: true, message: "Items added to order", additional_amount: additionalAmount, new_total: newTotal });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Customer add items error:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

export default router;