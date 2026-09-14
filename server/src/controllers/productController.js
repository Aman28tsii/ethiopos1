// server/src/controllers/productController.js

import { query } from '../config/database.js';
import { AppError, catchAsync } from '../middleware/errorHandler.js';

// ============================================
// HELPER: Resolve company context safely.
//
// NEVER fall back to a default company. If the JWT is missing
// a company_id or the middleware failed to set it, we must
// return 401 rather than silently impersonating another tenant.
// ============================================
const requireCompanyId = (req) => {
    const companyId = req.user?.company_id;
    if (!companyId) {
        throw new AppError('Company context required', 401, 'MISSING_COMPANY_CONTEXT');
    }
    return companyId;
};

// ============================================
// GET ALL PRODUCTS (Authenticated, company-scoped)
// ============================================
export const getAllProducts = catchAsync(async (req, res) => {
    const { limit = 100, offset = 0 } = req.pagination || {};
    const companyId = requireCompanyId(req);

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
// GET ALL PRODUCTS ADMIN VIEW (Authenticated, company-scoped)
// ============================================
export const getAllProductsAdmin = catchAsync(async (req, res) => {
    const companyId = requireCompanyId(req);

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
// GET PRODUCT BY ID (Authenticated, company-scoped)
// ============================================
export const getProductById = catchAsync(async (req, res) => {
    const { id } = req.params;
    const companyId = requireCompanyId(req);

    // Reject non-numeric IDs explicitly
    const numericId = parseInt(id, 10);
    if (!Number.isFinite(numericId) || numericId <= 0) {
        throw new AppError('Invalid product ID', 400);
    }

    const result = await query(
        `SELECT id, name, price, category, description, is_available, company_id 
         FROM products 
         WHERE id = $1 AND company_id = $2 AND is_available = true`,
        [numericId, companyId]
    );
    if (result.rows.length === 0) {
        throw new AppError('Product not found', 404);
    }
    res.json({ success: true, data: result.rows[0] });
});

// ============================================
// GET CATEGORIES (Authenticated, company-scoped)
// ============================================
export const getCategories = catchAsync(async (req, res) => {
    const companyId = requireCompanyId(req);

    const result = await query(
        `SELECT DISTINCT category FROM products 
         WHERE company_id = $1 AND is_available = true AND category IS NOT NULL 
         ORDER BY category`,
        [companyId]
    );

    res.json({ success: true, data: result.rows.map(r => r.category) });
});

// ============================================
// GET PUBLIC PRODUCTS BY TABLE (NO AUTH — QR MENU ONLY)
//
// The customer scans a QR code that contains a table ID.
// We look up the table, derive its company_id, and return only
// products owned by that company. There is NO default tenant.
// ============================================
export const getPublicProductsByTable = catchAsync(async (req, res) => {
    const { tableId } = req.query;

    // 1. tableId must be present
    if (tableId === undefined || tableId === null || tableId === '') {
        throw new AppError('tableId is required', 400);
    }

    // 2. tableId must be a positive integer (no SQL injection risk
    //    because we also parameterize, but we reject garbage early)
    const numericTableId = parseInt(tableId, 10);
    if (!Number.isFinite(numericTableId) || numericTableId <= 0) {
        throw new AppError('Invalid tableId', 400);
    }

    // 3. Look up the table (this is the ONLY source of truth for tenant)
    const tableResult = await query(
        `SELECT id, company_id, branch_id, table_number, status
         FROM tables
         WHERE id = $1`,
        [numericTableId]
    );

    if (tableResult.rows.length === 0) {
        throw new AppError('Table not found', 404);
    }

    const table = tableResult.rows[0];

    // Defensive: a table must always have a company_id
    if (!table.company_id) {
        throw new AppError('Table has no company context', 500);
    }

    // 4. Return ONLY available products for that table's company
    const productsResult = await query(
        `SELECT id, name, price, category, description, is_available
         FROM products
         WHERE company_id = $1 AND is_available = true
         ORDER BY name`,
        [table.company_id]
    );

    res.json({
        success: true,
        data: {
            table: {
                id: table.id,
                table_number: table.table_number,
                status: table.status
            },
            products: productsResult.rows
        }
    });
});

// ============================================
// CREATE PRODUCT (Authenticated, owner-scoped)
// ============================================
export const createProduct = catchAsync(async (req, res) => {
    const { name, price, category, description } = req.body;
    const companyId = requireCompanyId(req);

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
// UPDATE PRODUCT (Authenticated, owner-scoped)
// ============================================
export const updateProduct = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { name, price, category, is_available, description } = req.body;
    const companyId = requireCompanyId(req);

    const numericId = parseInt(id, 10);
    if (!Number.isFinite(numericId) || numericId <= 0) {
        throw new AppError('Invalid product ID', 400);
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
        [name, price, category, is_available, description, numericId, companyId]
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
// DELETE PRODUCT (Soft delete — Authenticated, owner-scoped)
// ============================================
export const deleteProduct = catchAsync(async (req, res) => {
    const { id } = req.params;
    const companyId = requireCompanyId(req);

    const numericId = parseInt(id, 10);
    if (!Number.isFinite(numericId) || numericId <= 0) {
        throw new AppError('Invalid product ID', 400);
    }

    const result = await query(
        `UPDATE products SET is_available = false 
         WHERE id = $1 AND company_id = $2 
         RETURNING id`,
        [numericId, companyId]
    );

    if (result.rows.length === 0) {
        throw new AppError('Product not found', 404);
    }

    res.json({
        success: true,
        message: 'Product deleted successfully'
    });
});