import express from "express";
import { protect, allowManager, allowOwner } from "../middleware/auth.js";
import { 
    authorizeCompany, 
    authorizeBranch, 
    requireCompanyContext 
} from "../middleware/authorization.js";
import { pool } from "../config/database.js";

const router = express.Router();

// ============================================================
// ALL ROUTES REQUIRE AUTHENTICATION AND COMPANY CONTEXT
// ============================================================
router.use(protect);
router.use(requireCompanyContext);
router.use(authorizeCompany);

// ============================================================
// GET ALL TABLES (Branch-isolated) - Normal staff
// ============================================================
router.get("/", authorizeBranch, async (req, res) => {
    try {
        const branchId = req.user.branch_id;
        const companyId = req.user.company_id;
        
        const result = await pool.query(
            `SELECT id, table_number, capacity, status, waiter_id, 
                    assigned_waiter_id, self_assigned, 
                    current_order_id, pending_order_id,
                    created_at, updated_at
             FROM tables 
             WHERE company_id = $1 AND branch_id = $2 
             ORDER BY table_number ASC`,
            [companyId, branchId]
        );
        
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Get tables error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// GET AVAILABLE TABLES (Branch-isolated)
// ============================================================
router.get("/available", authorizeBranch, async (req, res) => {
    try {
        const branchId = req.user.branch_id;
        const companyId = req.user.company_id;
        
        const result = await pool.query(
            `SELECT id, table_number, capacity 
             FROM tables 
             WHERE company_id = $1 AND branch_id = $2 AND status = 'available' 
             ORDER BY table_number ASC`,
            [companyId, branchId]
        );
        
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Get available tables error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// GET TABLES FOR OWNER - MUST BE BEFORE /:id
// ============================================================
router.get("/owner", allowOwner, async (req, res) => {
    try {
        const companyId = req.user.company_id;
        const requestedBranchId = req.query.branchId;
        
        let result;
        
        if (requestedBranchId) {
            // Owner selected a specific branch - verify it belongs to their company
            const branchCheck = await pool.query(
                "SELECT id FROM branches WHERE id = $1 AND company_id = $2 AND is_active = true",
                [requestedBranchId, companyId]
            );
            
            if (branchCheck.rows.length === 0) {
                return res.status(403).json({ 
                    success: false, 
                    error: "Branch not accessible for this company" 
                });
            }
            
            result = await pool.query(
                `SELECT id, table_number, capacity, status, waiter_id, 
                        assigned_waiter_id, self_assigned,
                        branch_id,
                        current_order_id, pending_order_id,
                        created_at, updated_at
                 FROM tables 
                 WHERE company_id = $1 AND branch_id = $2 
                 ORDER BY table_number ASC`,
                [companyId, requestedBranchId]
            );
        } else {
            // Owner viewing all branches (company-wide)
            result = await pool.query(
                `SELECT t.id, t.table_number, t.capacity, t.status, t.waiter_id, 
                        t.assigned_waiter_id, t.self_assigned,
                        t.branch_id, b.name as branch_name,
                        t.current_order_id, t.pending_order_id,
                        t.created_at, t.updated_at
                 FROM tables t
                 JOIN branches b ON t.branch_id = b.id
                 WHERE t.company_id = $1 
                 ORDER BY b.name, t.table_number ASC`,
                [companyId]
            );
        }
        
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Get owner tables error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// GET TABLE BY ID - MUST BE AFTER /owner AND /available
// ============================================================
router.get("/:id", authorizeBranch, async (req, res) => {
    try {
        const { id } = req.params;
        const branchId = req.user.branch_id;
        const companyId = req.user.company_id;
        
        // Validate id is a number
        if (isNaN(parseInt(id))) {
            return res.status(400).json({ 
                success: false, 
                error: "Invalid table ID" 
            });
        }
        
        const result = await pool.query(
            `SELECT id, table_number, capacity, status, waiter_id, 
                    assigned_waiter_id, self_assigned,
                    current_order_id, pending_order_id,
                    created_at, updated_at
             FROM tables 
             WHERE id = $1 AND company_id = $2 AND branch_id = $3`,
            [id, companyId, branchId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Table not found" });
        }
        
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error("Get table error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// CREATE TABLE (Manager+)
// ============================================================
router.post("/", authorizeBranch, allowManager, async (req, res) => {
    const { table_number, capacity, status } = req.body;
    const branchId = req.user.branch_id;
    const companyId = req.user.company_id;
    
    if (!table_number || !capacity) {
        return res.status(400).json({ 
            success: false, 
            error: "Table number and capacity are required" 
        });
    }
    
    try {
        // Check for duplicate table number in this branch
        const duplicateCheck = await pool.query(
            "SELECT id FROM tables WHERE table_number = $1 AND branch_id = $2",
            [table_number, branchId]
        );
        
        if (duplicateCheck.rows.length > 0) {
            return res.status(400).json({ 
                success: false, 
                error: `Table ${table_number} already exists in this branch` 
            });
        }
        
        const result = await pool.query(
            `INSERT INTO tables (company_id, branch_id, table_number, capacity, status) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING *`,
            [companyId, branchId, table_number, capacity, status || "available"]
        );
        
        res.status(201).json({ 
            success: true, 
            data: result.rows[0] 
        });
    } catch (err) {
        console.error("Create table error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// UPDATE TABLE (Manager+)
// ============================================================
router.put("/:id", authorizeBranch, allowManager, async (req, res) => {
    const { id } = req.params;
    const { table_number, capacity, status } = req.body;
    const branchId = req.user.branch_id;
    const companyId = req.user.company_id;
    
    // Validate id is a number
    if (isNaN(parseInt(id))) {
        return res.status(400).json({ 
            success: false, 
            error: "Invalid table ID" 
        });
    }
    
    try {
        // Verify table exists and belongs to this branch
        const tableCheck = await pool.query(
            "SELECT id FROM tables WHERE id = $1 AND company_id = $2 AND branch_id = $3",
            [id, companyId, branchId]
        );
        
        if (tableCheck.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Table not found" });
        }
        
        const result = await pool.query(
            `UPDATE tables 
             SET table_number = COALESCE($1, table_number),
                 capacity = COALESCE($2, capacity),
                 status = COALESCE($3, status),
                 updated_at = NOW()
             WHERE id = $4 AND company_id = $5 AND branch_id = $6
             RETURNING *`,
            [table_number, capacity, status, id, companyId, branchId]
        );
        
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error("Update table error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// DELETE TABLE (Manager+)
// ============================================================
router.delete("/:id", authorizeBranch, allowManager, async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branch_id;
    const companyId = req.user.company_id;
    
    // Validate id is a number
    if (isNaN(parseInt(id))) {
        return res.status(400).json({ 
            success: false, 
            error: "Invalid table ID" 
        });
    }
    
    try {
        // Verify table exists
        const tableCheck = await pool.query(
            "SELECT id FROM tables WHERE id = $1 AND company_id = $2 AND branch_id = $3",
            [id, companyId, branchId]
        );
        
        if (tableCheck.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Table not found" });
        }
        
        // Check for active orders on this table
        const activeOrders = await pool.query(
            `SELECT id FROM orders 
             WHERE table_id = $1 
             AND status NOT IN ('completed', 'cancelled')`,
            [id]
        );
        
        if (activeOrders.rows.length > 0) {
            return res.status(400).json({ 
                success: false, 
                error: "Cannot delete table with active orders" 
            });
        }
        
        const result = await pool.query(
            "DELETE FROM tables WHERE id = $1 AND company_id = $2 AND branch_id = $3 RETURNING id",
            [id, companyId, branchId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Table not found" });
        }
        
        res.json({ success: true, message: "Table deleted successfully" });
    } catch (err) {
        console.error("Delete table error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// UPDATE TABLE STATUS (Manager+)
// ============================================================
router.put("/:id/status", authorizeBranch, allowManager, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const branchId = req.user.branch_id;
    const companyId = req.user.company_id;
    
    const validStatuses = ["available", "occupied", "reserved", "cleaning"];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
            success: false, 
            error: "Invalid status. Must be: available, occupied, reserved, cleaning" 
        });
    }
    
    // Validate id is a number
    if (isNaN(parseInt(id))) {
        return res.status(400).json({ 
            success: false, 
            error: "Invalid table ID" 
        });
    }
    
    try {
        const result = await pool.query(
            `UPDATE tables 
             SET status = $1, updated_at = NOW() 
             WHERE id = $2 AND company_id = $3 AND branch_id = $4
             RETURNING *`,
            [status, id, companyId, branchId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Table not found" });
        }
        
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error("Update table status error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// ASSIGN WAITER TO TABLE (Manager+)
// ============================================================
router.put("/:id/assign-waiter", authorizeBranch, allowManager, async (req, res) => {
    const { id } = req.params;
    const { waiter_id } = req.body;
    const branchId = req.user.branch_id;
    const companyId = req.user.company_id;
    
    // Validate id is a number
    if (isNaN(parseInt(id))) {
        return res.status(400).json({ 
            success: false, 
            error: "Invalid table ID" 
        });
    }
    
    try {
        // Verify waiter belongs to this branch
        if (waiter_id) {
            const waiterCheck = await pool.query(
                "SELECT id FROM users WHERE id = $1 AND branch_id = $2 AND role = 'waiter'",
                [waiter_id, branchId]
            );
            
            if (waiterCheck.rows.length === 0) {
                return res.status(404).json({ 
                    success: false, 
                    error: "Waiter not found or not in this branch" 
                });
            }
        }
        
        const result = await pool.query(
            `UPDATE tables 
             SET assigned_waiter_id = $1, 
                 updated_at = NOW() 
             WHERE id = $2 AND company_id = $3 AND branch_id = $4
             RETURNING *`,
            [waiter_id || null, id, companyId, branchId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Table not found" });
        }
        
        res.json({ 
            success: true, 
            message: waiter_id ? "Waiter assigned successfully" : "Waiter unassigned",
            data: result.rows[0] 
        });
    } catch (err) {
        console.error("Assign waiter error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;