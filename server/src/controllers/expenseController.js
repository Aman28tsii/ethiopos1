// server/src/controllers/expenseController.js

import { query } from '../config/database.js';
import { AppError, catchAsync } from '../middleware/errorHandler.js';

// ============================================================
// GET ALL EXPENSES (Branch-isolated)
// ============================================================
export const getAllExpenses = catchAsync(async (req, res) => {
    const { startDate, endDate, category, limit = 100, offset = 0 } = req.query;
    
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    let sql = `
        SELECT e.*, u.name as created_by_name
        FROM expenses e
        LEFT JOIN users u ON e.user_id = u.id
        WHERE e.company_id = $1 AND e.branch_id = $2
    `;
    const params = [companyId, branchId];
    let paramIndex = 3;
    
    if (startDate) {
        sql += ` AND e.expense_date >= $${paramIndex++}`;
        params.push(startDate);
    }
    if (endDate) {
        sql += ` AND e.expense_date <= $${paramIndex++}`;
        params.push(endDate);
    }
    if (category) {
        sql += ` AND e.category = $${paramIndex++}`;
        params.push(category);
    }
    
    sql += ` ORDER BY e.expense_date DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await query(sql, params);
    
    const countResult = await query(
        'SELECT COUNT(*) FROM expenses WHERE company_id = $1 AND branch_id = $2',
        [companyId, branchId]
    );
    
    res.json({
        success: true,
        data: result.rows,
        pagination: {
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset)
        }
    });
});

// ============================================================
// GET EXPENSE BY ID (Tenant-validated)
// ============================================================
export const getExpenseById = catchAsync(async (req, res) => {
    const { id } = req.params;
    
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    const result = await query(
        `SELECT e.*, u.name as created_by_name
         FROM expenses e
         LEFT JOIN users u ON e.user_id = u.id
         WHERE e.id = $1 AND e.company_id = $2 AND e.branch_id = $3`,
        [id, companyId, branchId]
    );
    
    if (result.rows.length === 0) {
        throw new AppError('Expense not found', 404);
    }
    
    res.json({ success: true, data: result.rows[0] });
});

// ============================================================
// CREATE EXPENSE (Branch-isolated)
// ============================================================
export const createExpense = catchAsync(async (req, res) => {
    const { category, amount, description, expense_date } = req.body;
    
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const userId = req.user.id;
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    if (!category || !amount || amount <= 0) {
        throw new AppError('Category and valid amount are required', 400);
    }
    
    const result = await query(
        `INSERT INTO expenses (company_id, branch_id, user_id, category, amount, description, expense_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [companyId, branchId, userId, category, amount, description, expense_date || new Date().toISOString().split('T')[0]]
    );
    
    res.status(201).json({
        success: true,
        message: 'Expense recorded successfully',
        data: result.rows[0]
    });
});

// ============================================================
// UPDATE EXPENSE (Tenant-validated)
// ============================================================
export const updateExpense = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { category, amount, description, expense_date } = req.body;
    
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    const result = await query(
        `UPDATE expenses 
         SET category = COALESCE($1, category),
             amount = COALESCE($2, amount),
             description = COALESCE($3, description),
             expense_date = COALESCE($4, expense_date),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5 AND company_id = $6 AND branch_id = $7
         RETURNING *`,
        [category, amount, description, expense_date, id, companyId, branchId]
    );
    
    if (result.rows.length === 0) {
        throw new AppError('Expense not found', 404);
    }
    
    res.json({
        success: true,
        message: 'Expense updated successfully',
        data: result.rows[0]
    });
});

// ============================================================
// DELETE EXPENSE (Tenant-validated)
// ============================================================
export const deleteExpense = catchAsync(async (req, res) => {
    const { id } = req.params;
    
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    const result = await query(
        'DELETE FROM expenses WHERE id = $1 AND company_id = $2 AND branch_id = $3 RETURNING id',
        [id, companyId, branchId]
    );
    
    if (result.rows.length === 0) {
        throw new AppError('Expense not found', 404);
    }
    
    res.json({
        success: true,
        message: 'Expense deleted successfully'
    });
});

// ============================================================
// GET EXPENSE SUMMARY (Branch-isolated) - ✅ FIXED
// ============================================================
export const getExpenseSummary = catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query;
    
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    if (!startDate || !endDate) {
        throw new AppError('startDate and endDate are required', 400);
    }
    
    const totalResult = await query(
        `SELECT 
           COUNT(*) as total_count,
           COALESCE(SUM(amount), 0) as total_amount
         FROM expenses
         WHERE expense_date BETWEEN $1 AND $2
           AND company_id = $3
           AND branch_id = $4`,
        [startDate, endDate, companyId, branchId]
    );
    
    const categoryResult = await query(
        `SELECT 
           category,
           COUNT(*) as count,
           COALESCE(SUM(amount), 0) as total_amount
         FROM expenses
         WHERE expense_date BETWEEN $1 AND $2
           AND company_id = $3
           AND branch_id = $4
         GROUP BY category
         ORDER BY total_amount DESC`,
        [startDate, endDate, companyId, branchId]
    );
    
    res.json({
        success: true,
        data: {
            period: { startDate, endDate },
            summary: totalResult.rows[0],
            by_category: categoryResult.rows
        }
    });
});

// ============================================================
// GET EXPENSE CATEGORIES (Branch-isolated)
// ============================================================
export const getExpenseCategories = catchAsync(async (req, res) => {
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    const result = await query(
        `SELECT DISTINCT category 
         FROM expenses 
         WHERE company_id = $1 AND branch_id = $2 
         ORDER BY category`,
        [companyId, branchId]
    );
    
    res.json({ success: true, data: result.rows.map(r => r.category) });
});