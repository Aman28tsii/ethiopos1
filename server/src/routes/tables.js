import express from "express";
import { protect, allowManager } from "../middleware/auth.js";
import { authorizeBranch, requireCompanyContext } from "../middleware/authorization.js";
import { pool } from "../config/database.js";

const router = express.Router();

router.use(protect);
router.use(requireCompanyContext);
router.use(authorizeBranch);

// GET: All tables - ALWAYS use user's branch from JWT
router.get("/", async (req, res) => {
    try {
        // IGNORE query parameter - use JWT only
        const branchId = req.user.branch_id;
        
        const result = await pool.query(
            "SELECT id, table_number, capacity, status, waiter_id FROM tables WHERE branch_id =  ORDER BY table_number ASC",
            [branchId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Get tables error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET: Available tables
router.get("/available", async (req, res) => {
    try {
        const branchId = req.user.branch_id;
        const result = await pool.query(
            "SELECT id, table_number, capacity FROM tables WHERE branch_id =  AND status = 'available' ORDER BY table_number ASC",
            [branchId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Get available tables error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post("/", allowManager, async (req, res) => {
    const { table_number, capacity, status } = req.body;
    const branchId = req.user.branch_id;
    if (!table_number || !capacity) {
        return res.status(400).json({ success: false, error: "Table number and capacity are required" });
    }
    try {
        const result = await pool.query(
            "INSERT INTO tables (branch_id, table_number, capacity, status) VALUES (, , , ) RETURNING *",
            [branchId, table_number, capacity, status || "available"]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error("Create table error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put("/:id", allowManager, async (req, res) => {
    const { id } = req.params;
    const { table_number, capacity, status } = req.body;
    const branchId = req.user.branch_id;
    try {
        const result = await pool.query(
            "UPDATE tables SET table_number = COALESCE(, table_number), capacity = COALESCE(, capacity), status = COALESCE(, status), updated_at = NOW() WHERE id =  AND branch_id =  RETURNING *",
            [table_number, capacity, status, id, branchId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Table not found" });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error("Update table error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete("/:id", allowManager, async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branch_id;
    try {
        const activeOrders = await pool.query(
            "SELECT id FROM orders WHERE table_id =  AND status NOT IN ('completed', 'cancelled')",
            [id]
        );
        if (activeOrders.rows.length > 0) {
            return res.status(400).json({ success: false, error: "Cannot delete table with active orders." });
        }
        const result = await pool.query(
            "DELETE FROM tables WHERE id =  AND branch_id =  RETURNING id",
            [id, branchId]
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

router.put("/:id/status", allowManager, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const branchId = req.user.branch_id;
    const validStatuses = ["available", "occupied", "reserved", "cleaning"];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, error: "Invalid status" });
    }
    try {
        const result = await pool.query(
            "UPDATE tables SET status = , updated_at = NOW() WHERE id =  AND branch_id =  RETURNING *",
            [status, id, branchId]
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

export default router;
