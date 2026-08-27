import express from 'express';
import { protect, allowKitchen } from '../middleware/auth.js';
import { pool } from '../config/database.js';

const router = express.Router();

// GET: Kitchen Orders
router.get('/orders', protect, allowKitchen, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                ko.id,
                ko.order_id,
                ko.status,
                ko.created_at,
                o.order_number,
                o.customer_name,
                o.table_id,
                o.total_amount,
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
            GROUP BY ko.id, o.order_number, o.customer_name, o.table_id, ko.status, ko.created_at, t.table_number, o.total_amount
            ORDER BY ko.created_at ASC
        `);
        
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Kitchen orders error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT: Update Order Status
router.put('/orders/:orderId/status', protect, allowKitchen, async (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body;
    
    try {
        const result = await pool.query(
            `UPDATE kitchen_orders 
             SET status = $1, 
                 started_at = CASE WHEN $1 = 'preparing' AND status = 'pending' THEN NOW() ELSE started_at END,
                 completed_at = CASE WHEN $1 = 'ready' THEN NOW() ELSE completed_at END,
                 updated_at = NOW()
             WHERE order_id = $2
             RETURNING *`,
            [status, orderId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }
        
        if (status === 'ready') {
            await pool.query('UPDATE orders SET status = $1 WHERE id = $2', ['ready', orderId]);
        }
        
        res.json({
            success: true,
            message: `Order status updated to ${status}`,
            data: result.rows[0]
        });
    } catch (err) {
        console.error('Update error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET: Completed Orders
router.get('/completed', protect, allowKitchen, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                ko.order_id,
                ko.status,
                ko.completed_at,
                o.order_number,
                o.total_amount,
                t.table_number
            FROM kitchen_orders ko
            JOIN orders o ON ko.order_id = o.id
            LEFT JOIN tables t ON o.table_id = t.id
            WHERE ko.status IN ('ready', 'completed')
            ORDER BY ko.completed_at DESC
            LIMIT 30
        `);
        
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Completed orders error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;