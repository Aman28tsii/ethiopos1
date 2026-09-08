// server/src/routes/branches.js

import express from 'express';
import { protect, allowOwner } from '../middleware/auth.js';
import { query, getClient } from '../config/database.js';
import { AppError, catchAsync } from '../middleware/errorHandler.js';
import { authorizeBranch } from '../middleware/authorization.js';

const router = express.Router();

// ============================================================
// ALL BRANCH ROUTES REQUIRE AUTHENTICATION AND OWNER ROLE
// ============================================================
router.use(protect);
router.use(allowOwner);

// ============================================================
// GET ALL BRANCHES FOR CURRENT COMPANY
// ============================================================
router.get('/', catchAsync(async (req, res) => {
    const companyId = req.user.company_id;
    
    if (!companyId) {
        throw new AppError('Company context not found. Please login again.', 401);
    }
    
    const result = await query(
        `SELECT id, name, address, phone, is_active, created_at, updated_at
         FROM branches
         WHERE company_id = $1
         ORDER BY name ASC`,
        [companyId]
    );
    
    res.json({
        success: true,
        data: result.rows,
        company_id: companyId
    });
}));

// ============================================================
// GET SINGLE BRANCH BY ID (Company-scoped)
// ============================================================
router.get('/:id', catchAsync(async (req, res) => {
    const { id } = req.params;
    const companyId = req.user.company_id;
    
    if (!companyId) {
        throw new AppError('Company context not found. Please login again.', 401);
    }
    
    const result = await query(
        `SELECT id, name, address, phone, is_active, created_at, updated_at
         FROM branches
         WHERE id = $1 AND company_id = $2`,
        [id, companyId]
    );
    
    if (result.rows.length === 0) {
        throw new AppError('Branch not found or does not belong to your company', 404);
    }
    
    res.json({
        success: true,
        data: result.rows[0]
    });
}));

// ============================================================
// CREATE BRANCH (Company-scoped)
// ============================================================
router.post('/', catchAsync(async (req, res) => {
    const { name, address, phone } = req.body;
    const companyId = req.user.company_id;
    const userId = req.user.id;
    
    if (!companyId) {
        throw new AppError('Company context not found. Please login again.', 401);
    }
    
    if (!name || name.trim().length < 1) {
        throw new AppError('Branch name is required', 400);
    }
    
    // Check for duplicate branch name within the company
    const duplicateCheck = await query(
        'SELECT id FROM branches WHERE LOWER(name) = LOWER($1) AND company_id = $2',
        [name.trim(), companyId]
    );
    
    if (duplicateCheck.rows.length > 0) {
        throw new AppError(`A branch named "${name.trim()}" already exists in your company`, 409);
    }
    
    const result = await query(
        `INSERT INTO branches (company_id, name, address, phone, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, NOW(), NOW())
         RETURNING id, name, address, phone, is_active, created_at, updated_at`,
        [companyId, name.trim(), address || null, phone || null]
    );
    
    res.status(201).json({
        success: true,
        message: 'Branch created successfully',
        data: result.rows[0]
    });
}));

// ============================================================
// UPDATE BRANCH (Company-scoped)
// ============================================================
router.put('/:id', catchAsync(async (req, res) => {
    const { id } = req.params;
    const { name, address, phone, is_active } = req.body;
    const companyId = req.user.company_id;
    const userId = req.user.id;
    
    if (!companyId) {
        throw new AppError('Company context not found. Please login again.', 401);
    }
    
    // Verify branch exists and belongs to this company
    const existingBranch = await query(
        'SELECT id, name FROM branches WHERE id = $1 AND company_id = $2',
        [id, companyId]
    );
    
    if (existingBranch.rows.length === 0) {
        throw new AppError('Branch not found or does not belong to your company', 404);
    }
    
    // Build update query dynamically
    const updates = [];
    const params = [];
    let paramIndex = 1;
    
    if (name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        params.push(name.trim());
    }
    if (address !== undefined) {
        updates.push(`address = $${paramIndex++}`);
        params.push(address || null);
    }
    if (phone !== undefined) {
        updates.push(`phone = $${paramIndex++}`);
        params.push(phone || null);
    }
    if (is_active !== undefined) {
        updates.push(`is_active = $${paramIndex++}`);
        params.push(is_active);
    }
    
    if (updates.length === 0) {
        throw new AppError('No fields to update', 400);
    }
    
    updates.push(`updated_at = NOW()`);
    params.push(id, companyId);
    
    const result = await query(
        `UPDATE branches 
         SET ${updates.join(', ')}
         WHERE id = $${paramIndex} AND company_id = $${paramIndex + 1}
         RETURNING id, name, address, phone, is_active, created_at, updated_at`,
        params
    );
    
    res.json({
        success: true,
        message: 'Branch updated successfully',
        data: result.rows[0]
    });
}));

// ============================================================
// DELETE BRANCH (Company-scoped with safety checks)
// ============================================================
router.delete('/:id', catchAsync(async (req, res) => {
    const { id } = req.params;
    const companyId = req.user.company_id;
    const userId = req.user.id;
    
    if (!companyId) {
        throw new AppError('Company context not found. Please login again.', 401);
    }
    
    // Verify branch exists and belongs to this company
    const existingBranch = await query(
        'SELECT id, name FROM branches WHERE id = $1 AND company_id = $2',
        [id, companyId]
    );
    
    if (existingBranch.rows.length === 0) {
        throw new AppError('Branch not found or does not belong to your company', 404);
    }
    
    // Check if branch has any dependencies
    const dependencyChecks = await query(`
        SELECT 
            (SELECT COUNT(*) FROM users WHERE branch_id = $1) as user_count,
            (SELECT COUNT(*) FROM tables WHERE branch_id = $1) as table_count,
            (SELECT COUNT(*) FROM orders WHERE branch_id = $1) as order_count,
            (SELECT COUNT(*) FROM sales WHERE branch_id = $1) as sale_count,
            (SELECT COUNT(*) FROM ingredients WHERE branch_id = $1) as ingredient_count,
            (SELECT COUNT(*) FROM expenses WHERE branch_id = $1) as expense_count,
            (SELECT COUNT(*) FROM stock_transactions WHERE branch_id = $1) as stock_transaction_count,
            (SELECT COUNT(*) FROM kitchen_orders WHERE branch_id = $1) as kitchen_order_count,
            (SELECT COUNT(*) FROM idempotency_records WHERE branch_id = $1) as idempotency_count
    `, [id]);
    
    const deps = dependencyChecks.rows[0];
    
    if (deps.user_count > 0 || deps.table_count > 0 || deps.order_count > 0 || 
        deps.sale_count > 0 || deps.ingredient_count > 0 || deps.expense_count > 0 ||
        deps.stock_transaction_count > 0 || deps.kitchen_order_count > 0 ||
        deps.idempotency_count > 0) {
        
        const warnings = [];
        if (deps.user_count > 0) warnings.push(`${deps.user_count} users`);
        if (deps.table_count > 0) warnings.push(`${deps.table_count} tables`);
        if (deps.order_count > 0) warnings.push(`${deps.order_count} orders`);
        if (deps.sale_count > 0) warnings.push(`${deps.sale_count} sales`);
        if (deps.ingredient_count > 0) warnings.push(`${deps.ingredient_count} ingredients`);
        if (deps.expense_count > 0) warnings.push(`${deps.expense_count} expenses`);
        if (deps.stock_transaction_count > 0) warnings.push(`${deps.stock_transaction_count} stock transactions`);
        if (deps.kitchen_order_count > 0) warnings.push(`${deps.kitchen_order_count} kitchen orders`);
        if (deps.idempotency_count > 0) warnings.push(`${deps.idempotency_count} idempotency records`);
        
        throw new AppError(
            `Cannot delete branch "${existingBranch.rows[0].name}". It has associated data: ${warnings.join(', ')}. 
             Consider deactivating the branch instead.`,
            409
        );
    }
    
    // Safe to delete
    await query(
        'DELETE FROM branches WHERE id = $1 AND company_id = $2',
        [id, companyId]
    );
    
    res.json({
        success: true,
        message: `Branch "${existingBranch.rows[0].name}" deleted successfully`
    });
}));

export default router;