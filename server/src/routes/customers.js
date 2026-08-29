// server/src/routes/customers.js

import express from "express";
import { protect, allowOwner } from "../middleware/auth.js";
import { authorizeCompany, requireCompanyContext } from "../middleware/authorization.js";
import { pool } from "../config/database.js";

const router = express.Router();

// ============================================================
// ALL CUSTOMER ROUTES REQUIRE AUTHENTICATION, COMPANY CONTEXT, AND OWNER ROLE
// ============================================================
router.use(protect);
router.use(requireCompanyContext);
router.use(authorizeCompany);
router.use(allowOwner);

// ============================================================
// GET ALL CUSTOMERS (Company-level)
// ============================================================
router.get("/", async (req, res) => {
    try {
        const companyId = req.user.company_id;
        
        const result = await pool.query(
            `SELECT id, name, email, phone, address, loyalty_points, total_spent, visit_count, notes, created_at, last_visit
             FROM customers 
             WHERE company_id = $1
             ORDER BY name ASC`,
            [companyId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Get customers error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// GET CUSTOMER BY ID (Company-validated)
// ============================================================
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.company_id;
        
        const result = await pool.query(
            `SELECT id, name, email, phone, address, loyalty_points, total_spent, visit_count, notes, created_at, last_visit
             FROM customers 
             WHERE id = $1 AND company_id = $2`,
            [id, companyId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Customer not found" });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error("Get customer error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// GET CUSTOMER BY PHONE (Company-validated)
// ============================================================
router.get("/phone/:phone", async (req, res) => {
    try {
        const { phone } = req.params;
        const companyId = req.user.company_id;
        
        const result = await pool.query(
            `SELECT id, name, email, phone, address, loyalty_points, total_spent, visit_count, notes
             FROM customers 
             WHERE phone = $1 AND company_id = $2`,
            [phone, companyId]
        );
        res.json({ success: true, data: result.rows[0] || null });
    } catch (err) {
        console.error("Get customer by phone error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// CREATE CUSTOMER (Company-level)
// ============================================================
router.post("/", async (req, res) => {
    const { name, email, phone, address, notes } = req.body;
    const companyId = req.user.company_id;
    
    if (!name) {
        return res.status(400).json({ success: false, error: "Customer name is required" });
    }
    
    try {
        const result = await pool.query(
            `INSERT INTO customers (company_id, name, email, phone, address, notes, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             RETURNING id, name, email, phone, address, loyalty_points, total_spent, visit_count, notes, created_at`,
            [companyId, name, email || null, phone || null, address || null, notes || null]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error("Create customer error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// UPDATE CUSTOMER (Company-validated)
// ============================================================
router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { name, email, phone, address, loyalty_points, total_spent, visit_count, notes } = req.body;
    const companyId = req.user.company_id;
    
    try {
        const result = await pool.query(
            `UPDATE customers 
             SET name = COALESCE($1, name),
                 email = COALESCE($2, email),
                 phone = COALESCE($3, phone),
                 address = COALESCE($4, address),
                 loyalty_points = COALESCE($5, loyalty_points),
                 total_spent = COALESCE($6, total_spent),
                 visit_count = COALESCE($7, visit_count),
                 notes = COALESCE($8, notes),
                 updated_at = NOW()
             WHERE id = $9 AND company_id = $10
             RETURNING id, name, email, phone, address, loyalty_points, total_spent, visit_count, notes, updated_at`,
            [name, email, phone, address, loyalty_points, total_spent, visit_count, notes, id, companyId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Customer not found" });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error("Update customer error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// DELETE CUSTOMER (Company-validated)
// ============================================================
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.user.company_id;
        
        const result = await pool.query(
            "DELETE FROM customers WHERE id = $1 AND company_id = $2 RETURNING id",
            [id, companyId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Customer not found" });
        }
        res.json({ success: true, message: "Customer deleted successfully" });
    } catch (err) {
        console.error("Delete customer error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;