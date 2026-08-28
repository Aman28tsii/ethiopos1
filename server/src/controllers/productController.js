// server/src/controllers/productController.js

import { query } from '../config/database.js';
import { AppError, catchAsync } from '../middleware/errorHandler.js';

// ============================================
// GET ALL PRODUCTS (Public - Company-filtered)
// ============================================
export const getAllProducts = catchAsync(async (req, res) => {
    const { limit = 100, offset = 0 } = req.pagination || {};
    const companyId = req.query.companyId || req.user?.company_id || 1;
    
    const result = await pool.query(
        `SELECT id, name, price, category, description, is_available, company_id 
         FROM products 
         WHERE company_id = $1 AND is_available = true 
         ORDER BY name 
         LIMIT $2 OFFSET $3`,
        [companyId, limit, offset]
    );
    res.json({ success: true, data: result.rows });
});

// ============================================
// GET ALL PRODUCTS (Admin/Manager view)
// ============================================
export const getAllProductsAdmin = catchAsync(async (req, res) => {
    const companyId = req.user.company_id || req.params.companyId;
    
    const result = await pool.query(
        `SELECT id, name, price, category, description, is_available, company_id, created_at 
         FROM products 
         WHERE company_id = $1 
         ORDER BY name`,
        [companyId]
    );
    res.json({ success: true, data: result.rows });
});

// ============================================
// GET PRODUCT BY ID (Public - Company-validated)
// ============================================
export const getProductById = catchAsync(async (req, res) => {
    const { id } = req.params;
    const companyId = req.query.companyId || req.user?.company_id || 1;
    
    const result = await pool.query(
        `SELECT id, name, price, category, description, is_available, company_id 
         FROM products 
         WHERE id = $1 AND company_id = $2`,
        [id, companyId]
    );
    if (result.rows.length === 0) {
        throw new AppError('Product not found', 404);
    }
    res.json({ success: true, data: result.rows[0] });
});

// ============================================
// CREATE PRODUCT
// ============================================
export const createProduct = catchAsync(async (req, res) => {
    const { name, price, category, description } = req.body;
    const companyId = req.user.company_id;
    
    if (!name || !price) {
        throw new AppError('Name and price are required', 400);
    }
    
    const result = await pool.query(
        `INSERT INTO products (company_id, name, price, category, description, is_available) 
         VALUES ($1, $2, $3, $4, $5, true) 
         RETURNING id, name, price, category, description, is_available, company_id`,
        [companyId, name.trim(), price, category || null, description || null]
    );
    
    res.status(201).json({ 
        success: true, 
        message: 'Product created successfully', 
        data: result.rows[0] 
    });
});

// ============================================
// UPDATE PRODUCT
// ============================================
export const updateProduct = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { name, price, category, is_available, description } = req.body;
    const companyId = req.user.company_id;
    
    const result = await pool.query(
        `UPDATE products 
         SET name = COALESCE($1, name), 
             price = COALESCE($2, price), 
             category = COALESCE($3, category), 
             is_available = COALESCE($4, is_available),
             description = COALESCE($5, description),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6 AND company_id = $7
         RETURNING id, name, price, category, is_available, description, company_id`,
        [name, price, category, is_available, description, id, companyId]
    );
    
    if (result.rows.length === 0) {
        throw new AppError('Product not found', 404);
    }
    
    res.json({ 
        success: true, 
        message: 'Product updated successfully', 
        data: result.rows[0] 
    });
});

// ============================================
// DELETE PRODUCT (Soft delete)
// ============================================
export const deleteProduct = catchAsync(async (req, res) => {
    const { id } = req.params;
    const companyId = req.user.company_id;
    
    const result = await pool.query(
        'UPDATE products SET is_available = false WHERE id = $1 AND company_id = $2 RETURNING id',
        [id, companyId]
    );
    
    if (result.rows.length === 0) {
        throw new AppError('Product not found', 404);
    }
    
    res.json({ 
        success: true, 
        message: 'Product deleted successfully' 
    });
});

// ============================================
// GET CATEGORIES (Public - Company-filtered)
// ============================================
export const getCategories = catchAsync(async (req, res) => {
    const companyId = req.query.companyId || req.user?.company_id || 1;
    
    const result = await pool.query(
        `SELECT DISTINCT category FROM products 
         WHERE company_id = $1 AND is_available = true AND category IS NOT NULL 
         ORDER BY category`,
        [companyId]
    );
    
    res.json({ success: true, data: result.rows.map(r => r.category) });
});