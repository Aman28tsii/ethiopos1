// server/src/routes/orders.js

import express from "express";
import { protect, allowWaiter, allowCashier } from "../middleware/auth.js";
import { authorizeBranch } from "../middleware/authorization.js";
import { idempotent, requireIdempotency } from "../middleware/idempotency.js";
import { pool } from "../config/database.js";
import rateLimit from "express-rate-limit";
import { processOrderStockDeduction } from "../controllers/recipeController.js";
import { AppError } from "../middleware/errorHandler.js";
import { mutationLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

const trackLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { success: false, error: "Too many requests. Please wait." }
});

const generateOrderNumber = () => {
    const date = new Date();
    const timestamp = date.getTime().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
    return `ORD-${timestamp}${random}`;
};

const generateSaleNumber = () => {
    const date = new Date();
    const timestamp = date.getTime().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
    return `SALE-${timestamp}${random}`;
};

const calculateProductCost = async (productId, quantity, client) => {
    const recipeResult = await client.query(
        `SELECT ri.quantity_required, i.unit_cost,
                ri.wastage_percentage, ri.cooking_loss_percentage
         FROM recipe_ingredients ri
         JOIN ingredients i ON ri.ingredient_id = i.id
         WHERE ri.recipe_id IN (SELECT id FROM recipes WHERE product_id = $1)`,
        [productId]
    );
    
    let totalCost = 0;
    for (const item of recipeResult.rows) {
        const qtyRequired = parseFloat(item.quantity_required) || 0;
        const wastagePct = parseFloat(item.wastage_percentage) || 0;
        const cookingLossPct = parseFloat(item.cooking_loss_percentage) || 0;
        const unitCost = parseFloat(item.unit_cost) || 0;
        
        const effectiveQty = qtyRequired * quantity * (1 + wastagePct / 100) * (1 + cookingLossPct / 100);
        totalCost += effectiveQty * unitCost;
    }
    return totalCost;
};

const calculateOrderTotalCost = async (orderId, client) => {
    const itemsResult = await client.query(
        `SELECT oi.product_id, oi.quantity
         FROM order_items oi
         WHERE oi.order_id = $1`,
        [orderId]
    );
    
    let totalCost = 0;
    for (const item of itemsResult.rows) {
        const itemCost = await calculateProductCost(item.product_id, item.quantity, client);
        totalCost += itemCost;
    }
    return totalCost;
};

// ==================== PUBLIC ROUTES ====================

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

// ==================== FIXED QR ORDER ROUTE ====================
router.post("/qr-order", 
    mutationLimiter,
    requireIdempotency,
    idempotent,
    async (req, res) => {
        console.log('[QR ORDER] ====== START ======');
        console.log('[QR ORDER] Request body:', JSON.stringify(req.body, null, 2));
        
        try {
            const { items, table_id, customer_name, customer_phone, notes } = req.body;
            
            if (!items || items.length === 0) {
                console.log('[QR ORDER] ERROR: No items in order');
                return res.status(400).json({ success: false, error: "No items in order" });
            }
            
            console.log('[QR ORDER] Items:', JSON.stringify(items));
            console.log('[QR ORDER] Table ID:', table_id);
            
            // Validate table_id
            if (!table_id) {
                console.log('[QR ORDER] ERROR: No table ID provided');
                return res.status(400).json({ success: false, error: "Table ID is required" });
            }
            
            const client = await pool.connect();
            
            try {
                await client.query("BEGIN");
                console.log('[QR ORDER] Transaction started');
                
                // Get table info
                const tableResult = await client.query(
                    "SELECT id, branch_id, waiter_id, company_id FROM tables WHERE id = $1",
                    [table_id]
                );
                
                if (tableResult.rows.length === 0) {
                    console.log('[QR ORDER] ERROR: Table not found:', table_id);
                    await client.query("ROLLBACK");
                    return res.status(404).json({ success: false, error: "Table not found" });
                }
                
                const table = tableResult.rows[0];
                console.log('[QR ORDER] Table found:', JSON.stringify(table));
                
                const branchId = table.branch_id;
                const companyId = table.company_id;
                // If no waiter assigned, use NULL (will be assigned when waiter confirms)
                const waiterId = table.waiter_id || null;
                
                // Get company ID from branch if not available on table
                let finalCompanyId = companyId;
                if (!finalCompanyId) {
                    const branchResult = await client.query(
                        "SELECT company_id FROM branches WHERE id = $1",
                        [branchId]
                    );
                    if (branchResult.rows.length === 0) {
                        console.log('[QR ORDER] ERROR: Branch not found:', branchId);
                        await client.query("ROLLBACK");
                        return res.status(404).json({ success: false, error: "Branch not found" });
                    }
                    finalCompanyId = branchResult.rows[0].company_id;
                }
                
                console.log('[QR ORDER] Context - Company:', finalCompanyId, 'Branch:', branchId, 'Waiter:', waiterId);
                
                // Calculate total amount
                let totalAmount = 0;
                for (const item of items) {
                    const productResult = await client.query(
                        "SELECT price, company_id FROM products WHERE id = $1 AND is_available = true",
                        [item.product_id]
                    );
                    if (productResult.rows.length === 0) {
                        console.log('[QR ORDER] ERROR: Product not found:', item.product_id);
                        await client.query("ROLLBACK");
                        return res.status(404).json({ success: false, error: `Product ${item.product_id} not found` });
                    }
                    if (productResult.rows[0].company_id !== finalCompanyId) {
                        console.log('[QR ORDER] ERROR: Product company mismatch:', productResult.rows[0].company_id, 'vs', finalCompanyId);
                        await client.query("ROLLBACK");
                        return res.status(403).json({ success: false, error: `Product ${item.product_id} does not belong to this company` });
                    }
                    totalAmount += parseFloat(productResult.rows[0].price) * item.quantity;
                }
                
                console.log('[QR ORDER] Total amount:', totalAmount);
                
                // Generate order number
                const orderNumber = `QR-${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 1000)}`;
                console.log('[QR ORDER] Order number:', orderNumber);
                
                // Insert order
                const orderResult = await client.query(`
                    INSERT INTO orders (
                        order_number, total_amount, status, payment_status, 
                        customer_name, customer_phone, table_id, order_type, notes, 
                        source, waiter_id, company_id, branch_id
                    ) VALUES ($1, $2, 'pending_confirmation', 'pending', $3, $4, $5, 'dine_in', $6, 'qr_menu', $7, $8, $9)
                    RETURNING id, order_number, total_amount
                `, [
                    orderNumber, 
                    totalAmount, 
                    customer_name || null, 
                    customer_phone || null, 
                    table_id, 
                    notes || null, 
                    waiterId, 
                    finalCompanyId, 
                    branchId
                ]);
                
                const orderId = orderResult.rows[0].id;
                console.log('[QR ORDER] Order created with ID:', orderId);
                
                // Insert order items
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
                    console.log('[QR ORDER] Item inserted:', item.product_id, 'x', item.quantity);
                }
                
                // Stock deduction
                let stockResult = { deductions: [], totalWastageCost: 0 };
                try {
                    stockResult = await processOrderStockDeduction(orderId, items, client, finalCompanyId, branchId);
                    console.log('[QR ORDER] Stock deduction completed');
                } catch (stockError) {
                    console.error('[QR ORDER] Stock deduction failed:', stockError.message);
                    await client.query('ROLLBACK');
                    return res.status(409).json({ 
                        success: false, 
                        error: stockError.message || 'Insufficient stock for order' 
                    });
                }
                
                await client.query("COMMIT");
                console.log('[QR ORDER] Transaction committed successfully');
                
                // Emit socket event for waiter
                const io = req.app.get('io');
                if (io) {
                    const orderData = {
                        order_id: orderId,
                        order_number: orderNumber,
                        total_amount: totalAmount,
                        status: 'pending_confirmation',
                        branch_id: branchId,
                        company_id: finalCompanyId,
                        table_id: table_id,
                        source: 'qr_menu'
                    };
                    
                    io.to(`waiter_${branchId}`).emit('new_pending_order', orderData);
                    io.to(`branch_${finalCompanyId}_${branchId}`).emit('new_order_branch', orderData);
                    console.log('[QR ORDER] Socket events emitted');
                }
                
                res.status(201).json({
                    success: true,
                    message: "Order placed! Waiting for waiter confirmation.",
                    data: { 
                        order_id: orderId, 
                        order_number: orderNumber, 
                        total_amount: totalAmount, 
                        status: 'pending_confirmation',
                        stock_deductions: stockResult.deductions,
                        total_wastage_cost: stockResult.totalWastageCost
                    }
                });
                console.log('[QR ORDER] ====== SUCCESS ======');
                
            } catch (err) {
                await client.query("ROLLBACK");
                console.error('[QR ORDER] Transaction error:', err.message);
                console.error('[QR ORDER] Stack:', err.stack);
                throw err;
            } finally {
                client.release();
            }
        } catch (err) {
            console.error('[QR ORDER] ERROR:', err.message);
            console.error('[QR ORDER] Stack:', err.stack);
            res.status(500).json({ 
                success: false, 
                error: err.message || 'Failed to place order' 
            });
        }
    }
);

router.post("/:orderId/customer-add-items", 
    mutationLimiter,
    requireIdempotency,
    idempotent,
    async (req, res) => {
        const { orderId } = req.params;
        const { items } = req.body;
        
        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, error: "No items to add" });
        }
        
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            
            const orderCheck = await client.query(
                "SELECT id, status, total_amount, company_id, branch_id FROM orders WHERE id = $1 AND status = $2",
                [orderId, 'pending_confirmation']
            );
            if (orderCheck.rows.length === 0) {
                return res.status(404).json({ success: false, error: "Order not found or already confirmed" });
            }
            const order = orderCheck.rows[0];
            const companyId = order.company_id;
            const branchId = order.branch_id;
            
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
            
            let stockResult = { deductions: [], totalWastageCost: 0 };
            try {
                stockResult = await processOrderStockDeduction(orderId, newItems, client, companyId, branchId);
            } catch (stockError) {
                console.error('[QR ADD ITEMS] Stock deduction failed:', stockError.message);
                await client.query('ROLLBACK');
                throw new Error(stockError.message || 'Insufficient stock for additional items');
            }
            
            const newTotal = parseFloat(order.total_amount) + additionalAmount;
            await client.query(`
                UPDATE orders SET total_amount = $1, updated_at = NOW() WHERE id = $2
            `, [newTotal, orderId]);
            
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
            console.error("Customer add items error:", err);
            res.status(500).json({ success: false, error: err.message });
        } finally {
            client.release();
        }
    }
);

// ==================== PROTECTED ROUTES ====================

router.use(protect);

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

router.post("/", 
    authorizeBranch, 
    allowWaiter, 
    mutationLimiter,
    requireIdempotency, 
    idempotent, 
    async (req, res) => {
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
                    stockResult = await processOrderStockDeduction(orderId, items, client, companyId, branchId);
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
                        status: 'pending',
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
    }
);

router.put("/confirm/:orderId", authorizeBranch, allowWaiter, async (req, res) => {
    const { orderId } = req.params;
    const userId = req.user.id;
    const branchId = req.user.branch_id;
    const companyId = req.user.company_id;
    
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        
        const orderCheck = await client.query(`
            SELECT o.id, o.status, o.table_id, o.customer_name, o.order_number, o.waiter_id
            FROM orders o
            WHERE o.id = $1 AND o.status = 'pending_confirmation' AND o.branch_id = $2 AND o.company_id = $3
        `, [orderId, branchId, companyId]);
        
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
        
        res.json({ 
            success: true, 
            message: "Order confirmed and sent to kitchen", 
            data: { order_id: orderId, status: 'pending' } 
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Confirm order error:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// ==================== READY ORDERS ENDPOINT ====================
router.get("/ready", protect, async (req, res) => {
    try {
        const branchId = req.user?.branch_id || 1;
        const companyId = req.user?.company_id || 1;
        
        const result = await pool.query(`
            SELECT 
                o.id, 
                o.order_number, 
                o.total_amount, 
                o.customer_name, 
                o.table_id,
                o.created_at,
                o.status,
                o.payment_status,
                ko.status as kitchen_status
            FROM orders o
            JOIN kitchen_orders ko ON o.id = ko.order_id
            WHERE o.payment_status = 'pending'
                AND o.status = 'pending'
                AND ko.status = 'ready'
                AND o.branch_id = $1
                AND o.company_id = $2
            ORDER BY o.created_at ASC
        `, [branchId, companyId]);
        
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("[READY] Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==================== PAYMENT ENDPOINT ====================
router.post("/:orderId/pay", 
    authorizeBranch, 
    allowCashier, 
    mutationLimiter,
    requireIdempotency, 
    idempotent, 
    async (req, res) => {
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
            
            const totalCost = await calculateOrderTotalCost(orderId, client);
            const profit = parseFloat(order.total_amount) - totalCost;
            
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
            const saleResult = await client.query(`
                INSERT INTO sales (
                    sale_number, order_id, total_amount, total_cost, profit, 
                    payment_method, status, branch_id, company_id, created_at,
                    customer_name, customer_phone
                )
                VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, $8, NOW(), $9, $10)
                RETURNING id, sale_number, total_amount, total_cost, profit
            `, [
                saleNumber, 
                orderId, 
                order.total_amount, 
                totalCost, 
                profit,
                payment_method, 
                branchId, 
                companyId,
                order.customer_name || null,
                order.customer_phone || null
            ]);
            
            const sale = saleResult.rows[0];
            
            const orderItems = await client.query(`
                SELECT oi.product_id, oi.quantity, oi.unit_price, oi.total_price, p.name as product_name
                FROM order_items oi
                JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = $1
            `, [orderId]);
            
            for (const item of orderItems.rows) {
                const itemCost = await calculateProductCost(item.product_id, item.quantity, client);
                const itemProfit = item.total_price - itemCost;
                
                await client.query(`
                    INSERT INTO sale_items (
                        sale_id, product_id, quantity, unit_price, total_price,
                        total_cost, profit
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [
                    sale.id,
                    item.product_id,
                    item.quantity,
                    item.unit_price,
                    item.total_price,
                    itemCost,
                    itemProfit
                ]);
            }
            
            await client.query("COMMIT");
            
            const profitMargin = sale.total_amount > 0 ? (sale.profit / sale.total_amount) * 100 : 0;
            
            res.json({
                success: true,
                message: "Payment processed successfully",
                data: {
                    sale_id: sale.id,
                    sale_number: sale.sale_number,
                    order_id: parseInt(orderId),
                    total_amount: parseFloat(sale.total_amount),
                    total_cost: parseFloat(sale.total_cost),
                    profit: parseFloat(sale.profit),
                    profit_margin: parseFloat(profitMargin.toFixed(2)),
                    payment_method: payment_method
                }
            });
            
        } catch (err) {
            await client.query("ROLLBACK");
            console.error("Payment error:", err);
            res.status(500).json({ success: false, error: err.message });
        } finally {
            client.release();
        }
    }
);

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

router.post("/:orderId/add-items", 
    authorizeBranch, 
    allowWaiter, 
    mutationLimiter,
    async (req, res) => {
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
                stockResult = await processOrderStockDeduction(orderId, newItems, client, companyId, branchId);
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
    }
);

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

router.put("/:orderId/cancel", authorizeBranch, allowWaiter, async (req, res) => {
    const { orderId } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;
    const branchId = req.user.branch_id;
    const companyId = req.user.company_id;
    
    const client = await pool.connect();
    
    try {
        await client.query("BEGIN");
        
        const orderCheck = await client.query(`
            SELECT o.id, o.status, o.payment_status, o.table_id, o.order_number, 
                    o.company_id, o.branch_id, o.created_by, o.waiter_id
             FROM orders o
             WHERE o.id = $1 
               AND o.waiter_id = $2 
               AND o.branch_id = $3 
               AND o.company_id = $4
               AND o.status NOT IN ('completed', 'cancelled')`,
            [orderId, userId, branchId, companyId]
        );
        
        if (orderCheck.rows.length === 0) {
            const anyOrder = await client.query(
                "SELECT id, status, payment_status FROM orders WHERE id = $1",
                [orderId]
            );
            
            if (anyOrder.rows.length === 0) {
                throw new Error("Order not found");
            }
            
            if (anyOrder.rows[0].payment_status === 'paid') {
                throw new Error("Cannot cancel a paid order");
            }
            
            if (anyOrder.rows[0].status === 'completed') {
                throw new Error("Order already completed");
            }
            
            throw new Error("Order not assigned to you");
        }
        
        const order = orderCheck.rows[0];
        
        if (order.payment_status === 'paid') {
            throw new Error("Cannot cancel a paid order");
        }
        
        const orderItemsResult = await client.query(`
            SELECT 
                oi.product_id,
                oi.quantity,
                p.name as product_name,
                ri.ingredient_id,
                ri.quantity_required,
                ri.wastage_percentage,
                ri.cooking_loss_percentage,
                i.name as ingredient_name,
                i.unit,
                i.unit_cost,
                i.quantity as current_stock
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            LEFT JOIN recipes r ON p.id = r.product_id
            LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
            LEFT JOIN ingredients i ON ri.ingredient_id = i.id
            WHERE oi.order_id = $1
        `, [orderId]);
        
        const ingredientMap = new Map();
        
        for (const item of orderItemsResult.rows) {
            if (!item.ingredient_id) continue;
            
            const orderQty = parseFloat(item.quantity);
            const qtyRequired = parseFloat(item.quantity_required) || 0;
            const wastagePct = parseFloat(item.wastage_percentage) || 0;
            const cookingLossPct = parseFloat(item.cooking_loss_percentage) || 0;
            
            const expectedQuantity = qtyRequired * orderQty;
            const restoredQuantity = expectedQuantity * (1 + wastagePct / 100) * (1 + cookingLossPct / 100);
            
            if (ingredientMap.has(item.ingredient_id)) {
                const existing = ingredientMap.get(item.ingredient_id);
                existing.restore_quantity += restoredQuantity;
                existing.ingredient_name = item.ingredient_name;
                existing.unit = item.unit;
                existing.unit_cost = item.unit_cost;
                existing.current_stock = item.current_stock;
            } else {
                ingredientMap.set(item.ingredient_id, {
                    ingredient_id: item.ingredient_id,
                    ingredient_name: item.ingredient_name,
                    restore_quantity: restoredQuantity,
                    unit: item.unit,
                    unit_cost: item.unit_cost,
                    current_stock: item.current_stock
                });
            }
        }
        
        const ingredientIds = Array.from(ingredientMap.keys());
        
        if (ingredientIds.length > 0) {
            const lockResult = await client.query(`
                SELECT id, quantity, name, unit
                FROM ingredients
                WHERE id = ANY($1)
                  AND company_id = $2
                  AND branch_id = $3
                FOR UPDATE
            `, [ingredientIds, companyId, branchId]);
            
            for (const row of lockResult.rows) {
                const ingredientData = ingredientMap.get(row.id);
                const restoreQty = ingredientData.restore_quantity;
                const newQuantity = parseFloat(row.quantity) + restoreQty;
                
                await client.query(`
                    UPDATE ingredients 
                    SET quantity = $1,
                        updated_at = NOW()
                    WHERE id = $2
                      AND company_id = $3
                      AND branch_id = $4
                `, [newQuantity, row.id, companyId, branchId]);
                
                await client.query(`
                    INSERT INTO stock_transactions (
                        ingredient_id,
                        order_id,
                        expected_quantity,
                        actual_quantity,
                        wastage_amount,
                        wastage_percentage,
                        transaction_type,
                        notes,
                        company_id,
                        branch_id
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                `, [
                    row.id,
                    orderId,
                    restoreQty,
                    restoreQty,
                    0,
                    0,
                    'order_cancellation',
                    `Stock restored from cancelled order ${order.order_number}`,
                    companyId,
                    branchId
                ]);
            }
        }
        
        await client.query(`
            UPDATE orders 
            SET status = 'cancelled', 
                updated_at = CURRENT_TIMESTAMP,
                cancellation_reason = $1
            WHERE id = $2
        `, [reason || 'Cancelled by waiter', orderId]);
        
        await client.query(`
            UPDATE kitchen_orders 
            SET status = 'cancelled', 
                updated_at = CURRENT_TIMESTAMP
            WHERE order_id = $1
        `, [orderId]);
        
        if (order.table_id) {
            await client.query(`
                UPDATE tables 
                SET status = 'available', 
                    current_order_id = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [order.table_id]);
        }
        
        await client.query("COMMIT");
        
        res.json({ 
            success: true, 
            message: "Order cancelled successfully. Stock restored to inventory.",
            data: { 
                order_id: orderId,
                stock_restored: ingredientIds.length > 0,
                ingredients_restored: ingredientIds.length
            }
        });
        
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Cancel order error:", error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

export default router;