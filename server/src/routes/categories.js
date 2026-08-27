import express from "express";
import { protect, allowOwner } from "../middleware/auth.js";
import { authorizeCompany, requireCompanyContext } from "../middleware/authorization.js";
import { pool } from "../config/database.js";

const router = express.Router();

// All routes require authentication and company context
router.use(protect);
router.use(requireCompanyContext);

// GET ALL CATEGORIES (Company-filtered)
router.get("/", authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const result = await pool.query(
      "SELECT * FROM categories WHERE company_id = $1 ORDER BY name ASC",
      [companyId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Get categories error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET CATEGORIES WITH PRODUCT COUNT (Company-filtered)
router.get("/with-count", authorizeCompany, async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const result = await pool.query(
      `SELECT c.*, 
              COUNT(p.id) as product_count,
              SUM(CASE WHEN p.is_available = true THEN 1 ELSE 0 END) as available_products
       FROM categories c
       LEFT JOIN products p ON c.id = p.category_id AND p.company_id = $1
       WHERE c.company_id = $1
       GROUP BY c.id
       ORDER BY c.name ASC`,
      [companyId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Get categories with count error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// CREATE CATEGORY (Company-level)
router.post("/", authorizeCompany, allowOwner, async (req, res) => {
  const { name, description, color, icon } = req.body;
  const companyId = req.user.company_id;
  
  if (!name || name.trim().length < 2) {
    return res.status(400).json({ 
      success: false, 
      error: "Category name must be at least 2 characters" 
    });
  }
  
  try {
    const existing = await pool.query(
      "SELECT id FROM categories WHERE LOWER(name) = LOWER($1) AND company_id = $2",
      [name.trim(), companyId]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: "Category already exists in this company" 
      });
    }
    
    const result = await pool.query(
      `INSERT INTO categories (company_id, name, description, color, icon, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [companyId, name.trim(), description || null, color || "#6B7280", icon || null]
    );
    
    res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: result.rows[0]
    });
  } catch (err) {
    console.error("Create category error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// UPDATE CATEGORY (Company-validated)
router.put("/:id", authorizeCompany, allowOwner, async (req, res) => {
  const { id } = req.params;
  const { name, description, color, icon } = req.body;
  const companyId = req.user.company_id;
  
  try {
    const result = await pool.query(
      `UPDATE categories 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           color = COALESCE($3, color),
           icon = COALESCE($4, icon),
           updated_at = NOW()
       WHERE id = $5 AND company_id = $6
       RETURNING *`,
      [name, description, color, icon, id, companyId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Category not found" });
    }
    
    res.json({
      success: true,
      message: "Category updated successfully",
      data: result.rows[0]
    });
  } catch (err) {
    console.error("Update category error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE CATEGORY (Company-validated)
router.delete("/:id", authorizeCompany, allowOwner, async (req, res) => {
  const { id } = req.params;
  const companyId = req.user.company_id;
  
  try {
    const productCheck = await pool.query(
      "SELECT COUNT(*) as count FROM products WHERE category_id = $1 AND company_id = $2",
      [id, companyId]
    );
    
    if (parseInt(productCheck.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete category. It has ${productCheck.rows[0].count} products assigned.`
      });
    }
    
    const result = await pool.query(
      "DELETE FROM categories WHERE id = $1 AND company_id = $2 RETURNING id",
      [id, companyId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Category not found" });
    }
    
    res.json({
      success: true,
      message: "Category deleted successfully"
    });
  } catch (err) {
    console.error("Delete category error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET PRODUCTS BY CATEGORY (Company-validated)
router.get("/:id/products", authorizeCompany, async (req, res) => {
  const { id } = req.params;
  const companyId = req.user.company_id;
  
  try {
    const result = await pool.query(
      `SELECT p.*,
              c.name as category_name,
              c.color as category_color
       FROM products p
       JOIN categories c ON p.category_id = c.id
       WHERE p.category_id = $1 
         AND p.company_id = $2
         AND c.company_id = $2
       ORDER BY p.name ASC`,
      [id, companyId]
    );
    
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Get products by category error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
