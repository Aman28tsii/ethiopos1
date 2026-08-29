// server/src/controllers/waiterController.js

import { query, getClient } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';

const generateOrderNumber = () => {
    const date = new Date();
    const timestamp = date.getTime().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `ORD-${timestamp}${random}`;
};

// ============================================================
// CREATE ORDER (Waiter - Branch-isolated)
// ============================================================
export const createOrder = catchAsync(async (req, res) => {
    const { 
        items, customer_name, customer_phone, 
        table_id, order_type = 'dine_in', notes 
    } = req.body;
    
    const userId = req.user.id;
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    if (!companyId || !branchId) {
        throw new AppError('Company and branch context required', 401);
    }
    
    if (!items || items.length === 0) {
        throw new AppError('Order must have at least one item', 400);
    }
    
    // Validate table belongs to branch
    if (table_id) {
        const tableCheck = await query(
            'SELECT id FROM tables WHERE id = $1 AND branch_id = $2 AND company_id = $3',
            [table_id, branchId, companyId]
        );
        if (tableCheck.rows.length === 0) {
            throw new AppError('Table not found in this branch', 404);
        }
    }
    
    const client = await getClient();
    
    try {
        await client.query('BEGIN');
        
        let totalAmount = 0;
        const orderItems = [];
        
        for (const item of items) {
            const productResult = await client.query(
                `SELECT id, name, price, company_id 
                 FROM products 
                 WHERE id = $1 AND company_id = $2 AND is_available = true`,
                [item.product_id, companyId]
            );
            
            if (productResult.rows.length === 0) {
                throw new Error(`Product ${item.product_id} not found or unavailable`);
            }
            
            const product = productResult.rows[0];
            const quantity = item.quantity;
            const unitPrice = parseFloat(product.price);
            const itemTotal = unitPrice * quantity;
            
            totalAmount += itemTotal;
            
            orderItems.push({
                product_id: item.product_id,
                product_name: product.name,
                quantity,
                unit_price: unitPrice,
                total_price: itemTotal
            });
        }
        
        const orderNumber = generateOrderNumber();
        
        const orderResult = await client.query(`
            INSERT INTO orders (
                order_number, total_amount, created_by, status, 
                payment_status, customer_name, customer_phone, table_id, 
                order_type, notes, company_id, branch_id
            )
            VALUES ($1, $2, $3, 'pending', 'pending', $4, $5, $6, $7, $8, $9, $10)
            RETURNING id, order_number, total_amount, status
        `, [
            orderNumber, totalAmount, userId, 
            customer_name || null, customer_phone || null, 
            table_id || null, order_type, notes || null,
            companyId, branchId
        ]);
        
        const orderId = orderResult.rows[0].id;
        
        for (const item of orderItems) {
            await client.query(`
                INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price)
                VALUES ($1, $2, $3, $4, $5)
            `, [orderId, item.product_id, item.quantity, item.unit_price, item.total_price]);
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
        
        await client.query('COMMIT');
        
        res.status(201).json({
            success: true,
            message: 'Order created and sent to kitchen',
            data: {
                order_id: orderId,
                order_number: orderNumber,
                total_amount: totalAmount,
                status: 'pending',
                items: orderItems
            }
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Create order error:', error);
        throw error;
    } finally {
        client.release();
    }
});

// ============================================================
// GET WAITER'S OWN ORDERS (Branch-isolated)
// ============================================================
export const getMyOrders = catchAsync(async (req, res) => {
    const userId = req.user.id;
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    if (!companyId || !branchId) {
        throw new AppError('Authentication required', 401);
    }
    
    const result = await query(`
        SELECT 
            o.id, 
            o.order_number, 
            o.total_amount, 
            o.status, 
            o.payment_status,
            o.customer_name, 
            o.table_id,
            t.table_number,
            o.created_at,
            (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
        FROM orders o
        LEFT JOIN tables t ON o.table_id = t.id
        WHERE o.created_by = $1
          AND o.company_id = $2
          AND o.branch_id = $3
          AND o.status NOT IN ('completed', 'cancelled')
        ORDER BY o.created_at DESC
    `, [userId, companyId, branchId]);
    
    res.json({ success: true, data: result.rows });
});

// ============================================================
// GET ORDER DETAILS (Tenant-validated)
// ============================================================
export const getOrderDetails = catchAsync(async (req, res) => {
    const { orderId } = req.params;
    const userId = req.user.id;
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    if (!companyId || !branchId) {
        throw new AppError('Authentication required', 401);
    }
    
    const orderResult = await query(`
        SELECT o.*, t.table_number, u.name as waiter_name
        FROM orders o
        LEFT JOIN tables t ON o.table_id = t.id
        LEFT JOIN users u ON o.created_by = u.id
        WHERE o.id = $1 
          AND o.created_by = $2
          AND o.company_id = $3
          AND o.branch_id = $4
    `, [orderId, userId, companyId, branchId]);
    
    if (orderResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    const itemsResult = await query(`
        SELECT oi.*, p.name as product_name
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1
    `, [orderId]);
    
    res.json({
        success: true,
        data: {
            ...orderResult.rows[0],
            items: itemsResult.rows
        }
    });
});

// ============================================================
// ADD ITEMS TO EXISTING ORDER (Tenant-validated)
// ============================================================
export const addOrderItems = catchAsync(async (req, res) => {
    const { orderId } = req.params;
    const { items } = req.body;
    const userId = req.user.id;
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    if (!companyId || !branchId) {
        throw new AppError('Authentication required', 401);
    }
    
    if (!items || items.length === 0) {
        return res.status(400).json({ success: false, error: 'No items to add' });
    }
    
    const client = await getClient();
    
    try {
        await client.query('BEGIN');
        
        const orderCheck = await client.query(
            `SELECT status, payment_status, total_amount 
             FROM orders 
             WHERE id = $1 AND company_id = $2 AND branch_id = $3`,
            [orderId, companyId, branchId]
        );
        
        if (orderCheck.rows.length === 0) {
            throw new Error('Order not found');
        }
        
        const order = orderCheck.rows[0];
        if (order.payment_status === 'paid') {
            throw new Error('Cannot add items to a paid order');
        }
        if (order.status === 'completed') {
            throw new Error('Order already completed');
        }
        
        let additionalAmount = 0;
        let addedItemsCount = 0;
        
        for (const item of items) {
            const productResult = await client.query(
                `SELECT price, name, company_id FROM products WHERE id = $1`,
                [item.product_id]
            );
            
            if (productResult.rows[0].company_id !== companyId) {
                throw new Error(`Product ${item.product_id} does not belong to this company`);
            }
            
            const unitPrice = parseFloat(productResult.rows[0].price);
            const itemTotal = unitPrice * item.quantity;
            additionalAmount += itemTotal;
            addedItemsCount += item.quantity;
            
            await client.query(`
                INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price)
                VALUES ($1, $2, $3, $4, $5)
            `, [orderId, item.product_id, item.quantity, unitPrice, itemTotal]);
        }
        
        const newTotal = parseFloat(order.total_amount) + additionalAmount;
        
        await client.query(`
            UPDATE orders 
            SET total_amount = $1,
                updated_at = NOW()
            WHERE id = $2
        `, [newTotal, orderId]);
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            message: 'Items added to order',
            additional_amount: additionalAmount,
            new_total: newTotal,
            items_added: addedItemsCount
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Add items error:', error);
        throw error;
    } finally {
        client.release();
    }
});

// ============================================================
// CANCEL ORDER (Tenant-validated)
// ============================================================
export const cancelOrder = catchAsync(async (req, res) => {
    const { orderId } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    if (!companyId || !branchId) {
        throw new AppError('Authentication required', 401);
    }
    
    const client = await getClient();
    
    try {
        await client.query('BEGIN');
        
        const orderCheck = await client.query(
            `SELECT status, payment_status, table_id 
             FROM orders 
             WHERE id = $1 AND created_by = $2 AND company_id = $3 AND branch_id = $4`,
            [orderId, userId, companyId, branchId]
        );
        
        if (orderCheck.rows.length === 0) {
            throw new Error('Order not found or does not belong to you');
        }
        
        const order = orderCheck.rows[0];
        
        if (order.payment_status === 'paid') {
            throw new Error('Cannot cancel a paid order');
        }
        
        if (order.status === 'completed') {
            throw new Error('Order already completed');
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
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            message: 'Order cancelled successfully',
            data: { order_id: orderId }
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Cancel order error:', error);
        throw error;
    } finally {
        client.release();
    }
});