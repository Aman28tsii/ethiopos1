// server/src/routes/tables.js
import express from 'express';
import { protect, allowManager, allowWaiter, allowOwner } from '../middleware/auth.js';
import { authorizeCompany, authorizeBranch, requireCompanyContext, requireBranchContext } from '../middleware/authorization.js';
import { pool } from '../config/database.js';

const router = express.Router();

// Protected routes
router.use(protect);
router.use(requireCompanyContext);

// Get all tables (for current branch)
router.get('/', authorizeBranch, async (req, res) => {
    try {
        const branchId = req.user.branch_id || req.query.branchId;
        
        const result = await pool.query(
            `SELECT t.id, t.table_number, t.capacity, t.status, t.waiter_id,
                    u.name as waiter_name
             FROM tables t
             LEFT JOIN users u ON t.waiter_id = u.id
             WHERE t.branch_id = $1
             ORDER BY t.table_number ASC`,
            [branchId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Get tables error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get available tables
router.get('/available', authorizeBranch, async (req, res) => {
    try {
        const branchId = req.user.branch_id || req.query.branchId;
        
        const result = await pool.query(
            `SELECT id, table_number, capacity
             FROM tables 
             WHERE branch_id = $1 AND status = 'available'
             ORDER BY table_number ASC`,
            [branchId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Get available tables error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Create table (manager/owner)
router.post('/', authorizeBranch, allowManager, async (req, res) => {
    const { table_number, capacity, status } = req.body;
    const branchId = req.user.branch_id || req.body.branchId;
    
    if (!table_number || !capacity) {
        return res.status(400).json({ success: false, error: 'Table number and capacity are required' });
    }
    
    try {
        // Check if table number already exists in this branch
        const existing = await pool.query(
            'SELECT id FROM tables WHERE table_number = $1 AND branch_id = $2',
            [table_number, branchId]
        );
        
        if (existing.rows.length > 0) {
            return res.status(400).json({ success: false, error: `Table ${table_number} already exists in this branch` });
        }
        
        const result = await pool.query(
            `INSERT INTO tables (branch_id, table_number, capacity, status) 
             VALUES ($1, $2, $3, $4) 
             RETURNING id, table_number, capacity, status`,
            [branchId, table_number, capacity, status || 'available']
        );
        
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('Create table error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Update table
router.put('/:id', authorizeBranch, allowManager, async (req, res) => {
    const { id } = req.params;
    const { table_number, capacity, status } = req.body;
    const branchId = req.user.branch_id || req.body.branchId;
    
    try {
        const result = await pool.query(
            `UPDATE tables 
             SET table_number = COALESCE($1, table_number),
                 capacity = COALESCE($2, capacity),
                 status = COALESCE($3, status),
                 updated_at = NOW()
             WHERE id = $4 AND branch_id = $5
             RETURNING id, table_number, capacity, status`,
            [table_number, capacity, status, id, branchId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Table not found' });
        }
        
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('Update table error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Delete table
router.delete('/:id', authorizeBranch, allowManager, async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branch_id || req.body.branchId;
    
    try {
        // Check if table has active orders
        const activeOrders = await pool.query(
            `SELECT id FROM orders 
             WHERE table_id = $1 AND status NOT IN ('completed', 'cancelled')`,
            [id]
        );
        
        if (activeOrders.rows.length > 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Cannot delete table with active orders.' 
            });
        }
        
        const result = await pool.query(
            'DELETE FROM tables WHERE id = $1 AND branch_id = $2 RETURNING id',
            [id, branchId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Table not found' });
        }
        
        res.json({ success: true, message: 'Table deleted successfully' });
    } catch (err) {
        console.error('Delete table error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Update table status
router.put('/:id/status', authorizeBranch, allowManager, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const branchId = req.user.branch_id || req.body.branchId;
    
    const validStatuses = ['available', 'occupied', 'reserved', 'cleaning'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    
    try {
        const result = await pool.query(
            `UPDATE tables 
             SET status = $1, updated_at = NOW()
             WHERE id = $2 AND branch_id = $3
             RETURNING id, table_number, status`,
            [status, id, branchId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Table not found' });
        }
        
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('Update table status error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;