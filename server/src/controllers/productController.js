// server/src/controllers/productController.js

import { query } from '../config/database.js';
import { AppError, catchAsync } from '../middleware/errorHandler.js';

// ============================================
// GET ALL PRODUCTS (Public - NO AUTH REQUIRED)
// ============================================
export const getAllProducts = catchAsync(async (req, res) => {
    const { limit = 100, offset = 0 } = req.pagination || {};
    
    const companyId = req.user?.company_id || 1;
    
    const result = await query(
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
// GET ALL PRODUCTS (Admin/Manager view - Authenticated only)
// ============================================
export const getAllProductsAdmin = catchAsync(async (req, res) => {
    const companyId = req.user?.company_id;
    
    if (!companyId) {
        throw new AppError('User company not found. Please login again.', 403);
    }
    
    const result = await query(
        `SELECT id, name, price, category, description, is_available, company_id, created_at 
         FROM products 
         WHERE company_id = $1 
         ORDER BY name`,
        [companyId]
    );
    res.json({ success: true, data: result.rows });
});

// ============================================
// GET PRODUCT BY ID (Public - NO AUTH REQUIRED)
// ============================================
export const getProductById = catchAsync(async (req, res) => {
    const { id } = req.params;
    // ✅ FIXED: Allow public access with default company 1
    const companyId = req.user?.company_id || 1;
    
    const result = await query(
        `SELECT id, name, price, category, description, is_available, company_id 
         FROM products 
         WHERE id = $1 AND company_id = $2 AND is_available = true`,
        [id, companyId]
    );
    if (result.rows.length === 0) {
        throw new AppError('Product not found', 404);
    }
    res.json({ success: true, data: result.rows[0] });
});

// ============================================
// GET CATEGORIES (Public - NO AUTH REQUIRED)
// ============================================
export const getCategories = catchAsync(async (req, res) => {
    // ✅ FIXED: Allow public access with default company 1
    const companyId = req.user?.company_id || 1;
    
    const result = await query(
        `SELECT DISTINCT category FROM products 
         WHERE company_id = $1 AND is_available = true AND category IS NOT NULL 
         ORDER BY category`,
        [companyId]
    );
    
    res.json({ success: true, data: result.rows.map(r => r.category) });
});

// ============================================
// CREATE PRODUCT (Authenticated only)
// ============================================
export const createProduct = catchAsync(async (req, res) => {
    const { name, price, category, description } = req.body;
    const companyId = req.user?.company_id;
    
    if (!companyId) {
        throw new AppError('User company not found. Please login again.', 403);
    }
    
    if (!name || !price) {
        throw new AppError('Name and price are required', 400);
    }
    
    const result = await query(
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
// UPDATE PRODUCT (Authenticated only)
// ============================================
export const updateProduct = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { name, price, category, is_available, description } = req.body;
    const companyId = req.user?.company_id;
    
    if (!companyId) {
        throw new AppError('User company not found. Please login again.', 403);
    }
    
    const result = await query(
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
// DELETE PRODUCT (Soft delete - Authenticated only)
// ============================================
export const deleteProduct = catchAsync(async (req, res) => {
    const { id } = req.params;
    const companyId = req.user?.company_id;
    
    if (!companyId) {
        throw new AppError('User company not found. Please login again.', 403);
    }
    
    const result = await query(
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