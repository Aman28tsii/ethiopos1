import express from "express";
import { protect, allowWaiter } from "../middleware/auth.js";
import { authorizeBranch, requireCompanyContext } from "../middleware/authorization.js";
import { pool } from "../config/database.js";

const router = express.Router();

// All routes require authentication and company context
router.use(protect);
router.use(requireCompanyContext);

// ============================================================
// WAITER ROUTES (Branch-level)
// ============================================================

// Get waiter's assigned tables
router.get("/my-tables", authorizeBranch, allowWaiter, async (req, res) => {
    const waiterId = req.user.id;
    const branchId = req.user.branch_id;
    
    try {
        const result = await pool.query(
            `SELECT t.*, 
                    CASE WHEN t.self_assigned THEN 'Self-Assigned' ELSE 'Manager-Assigned' END as assignment_type
             FROM tables t
             WHERE t.assigned_waiter_id = $1 AND t.branch_id = $2
             ORDER BY t.status = 'occupied' DESC, t.table_number ASC`,
            [waiterId, branchId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Get my tables error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get available tables for self-assignment
router.get("/available-tables", authorizeBranch, allowWaiter, async (req, res) => {
    const waiterId = req.user.id;
    const branchId = req.user.branch_id;
    
    try {
        const result = await pool.query(
            `SELECT t.* 
             FROM tables t
             WHERE t.status = 'available' 
               AND t.branch_id = $1
               AND (t.assigned_waiter_id IS NULL OR t.assigned_waiter_id = $2)
             ORDER BY t.table_number ASC`,
            [branchId, waiterId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Get available tables error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Self-assign table
router.post("/assign-table/:tableId", authorizeBranch, allowWaiter, async (req, res) => {
    const { tableId } = req.params;
    const waiterId = req.user.id;
    const branchId = req.user.branch_id;
    
    const client = await pool.connect();
    
    try {
        await client.query("BEGIN");
        
        const tableCheck = await client.query(
            `SELECT id, table_number, status, assigned_waiter_id 
             FROM tables 
             WHERE id = $1 AND branch_id = $2`,
            [tableId, branchId]
        );
        
        if (tableCheck.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ success: false, error: "Table not found" });
        }
        
        const table = tableCheck.rows[0];
        
        if (table.status !== 'available') {
            await client.query("ROLLBACK");
            return res.status(400).json({ 
                success: false, 
                error: `Table ${table.table_number} is ${table.status}. Only available tables can be assigned.` 
            });
        }
        
        const currentAssignments = await client.query(
            `SELECT COUNT(*) as count 
             FROM tables 
             WHERE assigned_waiter_id = $1 
               AND branch_id = $2
               AND status IN ('available', 'occupied', 'reserved')`,
            [waiterId, branchId]
        );
        
        if (parseInt(currentAssignments.rows[0].count) >= 5) {
            await client.query("ROLLBACK");
            return res.status(400).json({ 
                success: false, 
                error: "You already have 5 assigned tables. Please unassign some tables first." 
            });
        }
        
        await client.query(
            `UPDATE tables 
             SET assigned_waiter_id = $1, 
                 assignment_date = CURRENT_DATE,
                 assignment_method = 'self',
                 assigned_by = $1,
                 self_assigned = true,
                 updated_at = NOW()
             WHERE id = $2 AND branch_id = $3`,
            [waiterId, tableId, branchId]
        );
        
        await client.query(
            `INSERT INTO waiter_self_assignments (waiter_id, table_id, status)
             VALUES ($1, $2, 'active')`,
            [waiterId, tableId]
        );
        
        await client.query("COMMIT");
        
        res.json({ 
            success: true, 
            message: `Table ${table.table_number} assigned to you successfully!`,
            data: { table_id: tableId, table_number: table.table_number }
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Self-assign table error:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// Unassign table
router.delete("/unassign-table/:tableId", authorizeBranch, allowWaiter, async (req, res) => {
    const { tableId } = req.params;
    const waiterId = req.user.id;
    const branchId = req.user.branch_id;
    
    const client = await pool.connect();
    
    try {
        await client.query("BEGIN");
        
        const tableCheck = await client.query(
            `SELECT id, table_number, status, assigned_waiter_id 
             FROM tables 
             WHERE id = $1 AND assigned_waiter_id = $2 AND branch_id = $3`,
            [tableId, waiterId, branchId]
        );
        
        if (tableCheck.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ 
                success: false, 
                error: "Table not found or not assigned to you" 
            });
        }
        
        const table = tableCheck.rows[0];
        
        if (table.status === 'occupied') {
            await client.query("ROLLBACK");
            return res.status(400).json({ 
                success: false, 
                error: `Table ${table.table_number} is occupied. Cannot unassign until table is available.` 
            });
        }
        
        await client.query(
            `UPDATE tables 
             SET assigned_waiter_id = NULL, 
                 assignment_date = NULL,
                 assignment_method = NULL,
                 self_assigned = false,
                 updated_at = NOW()
             WHERE id = $1 AND branch_id = $2`,
            [tableId, branchId]
        );
        
        await client.query(
            `UPDATE waiter_self_assignments 
             SET unassigned_at = NOW(), status = 'inactive'
             WHERE table_id = $1 AND status = 'active'`,
            [tableId]
        );
        
        await client.query("COMMIT");
        
        res.json({ 
            success: true, 
            message: `Table ${table.table_number} unassigned successfully!` 
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Unassign table error:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// Get waiter's shift
router.get("/my-shift", authorizeBranch, allowWaiter, async (req, res) => {
    const waiterId = req.user.id;
    const branchId = req.user.branch_id;
    
    try {
        const result = await pool.query(
            `SELECT ws.* FROM waiter_shifts ws
             JOIN users u ON ws.waiter_id = u.id
             WHERE ws.waiter_id = $1 AND u.branch_id = $2
               AND ws.shift_date = CURRENT_DATE 
               AND ws.is_active = true`,
            [waiterId, branchId]
        );
        res.json({ success: true, data: result.rows[0] || null });
    } catch (err) {
        console.error("Get my shift error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get waiter's orders
router.get("/my-orders", authorizeBranch, allowWaiter, async (req, res) => {
    const waiterId = req.user.id;
    const branchId = req.user.branch_id;
    
    try {
        const result = await pool.query(
            `SELECT o.id, o.order_number, o.total_amount, o.status, o.payment_status,
                    o.customer_name, o.table_id, o.created_at,
                    o.source,
                    t.table_number,
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'name', p.name,
                                'quantity', oi.quantity,
                                'price', oi.unit_price
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
               AND o.status NOT IN ('completed', 'cancelled')
             GROUP BY o.id, t.table_number, o.source
             ORDER BY o.created_at DESC`,
            [waiterId, branchId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Get waiter orders error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get pending confirmations
router.get("/pending-confirmations", authorizeBranch, allowWaiter, async (req, res) => {
    const waiterId = req.user.id;
    const branchId = req.user.branch_id;
    
    try {
        const result = await pool.query(
            `SELECT o.id, o.order_number, o.total_amount, o.customer_name, o.customer_phone, 
                    o.table_id, o.notes, o.created_at, o.status,
                    o.source,
                    t.table_number,
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'name', p.name,
                                'quantity', oi.quantity,
                                'price', oi.unit_price
                            )
                        ) FILTER (WHERE p.id IS NOT NULL), 
                        '[]'
                    ) as items
             FROM orders o
             JOIN tables t ON o.table_id = t.id
             LEFT JOIN order_items oi ON o.id = oi.order_id
             LEFT JOIN products p ON oi.product_id = p.id
             WHERE o.status = 'pending_confirmation' 
               AND o.source = 'qr_menu'
               AND o.branch_id = $1
               AND (o.waiter_id = $2 OR o.waiter_id IS NULL)
             GROUP BY o.id, t.table_number, o.source
             ORDER BY o.created_at ASC`,
            [branchId, waiterId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Get pending confirmations error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get order details
router.get("/order/:orderId", authorizeBranch, allowWaiter, async (req, res) => {
    const { orderId } = req.params;
    const waiterId = req.user.id;
    const branchId = req.user.branch_id;
    
    try {
        const result = await pool.query(
            `SELECT o.*, t.table_number,
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'name', p.name,
                                'quantity', oi.quantity,
                                'price', oi.unit_price,
                                'total', oi.total_price
                            )
                        ) FILTER (WHERE p.id IS NOT NULL), 
                        '[]'
                    ) as items
             FROM orders o
             LEFT JOIN tables t ON o.table_id = t.id
             LEFT JOIN order_items oi ON o.id = oi.order_id
             LEFT JOIN products p ON oi.product_id = p.id
             WHERE o.id = $1
               AND o.branch_id = $2
               AND (o.waiter_id = $3 OR o.created_by = $3)
             GROUP BY o.id, t.table_number`,
            [orderId, branchId, waiterId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Order not found or not assigned to you" });
        }
        
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error("Get order details error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
