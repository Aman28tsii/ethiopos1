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
// GET EXPENSE SUMMARY (Branch-isolated)
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

// ============================================================
// COPY LAST MONTH'S EXPENSES  ★ NEW
//
// Copies every expense from the previous calendar month into
// the current month with today's date.
//
// Duplicate protection: if an expense with the same category
// AND same amount already exists in the current month, it is
// skipped. This prevents accidental double-clicks from creating
// duplicate rows.
//
// Returns: { created[], skipped_count, copied_count }
// ============================================================
export const copyFromPreviousMonth = catchAsync(async (req, res) => {
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }

    const userId = req.user.id;
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;

    const today = new Date();

    // Date boundaries
    const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastOfThisMonth  = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const firstOfPrevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastOfPrevMonth  = new Date(today.getFullYear(), today.getMonth(), 0);

    const isoDate = (d) => d.toISOString().split('T')[0];
    const todayIso = isoDate(today);

    // ---- 1. Fetch previous month's expenses ----
    const prev = await query(
        `SELECT category, amount, description
         FROM expenses
         WHERE expense_date BETWEEN $1 AND $2
           AND company_id = $3
           AND branch_id  = $4
         ORDER BY category ASC`,
        [isoDate(firstOfPrevMonth), isoDate(lastOfPrevMonth), companyId, branchId]
    );

    if (prev.rows.length === 0) {
        return res.status(404).json({
            success: false,
            error: 'No expenses found in the previous month to copy'
        });
    }

    // ---- 2. Fetch this month's existing expenses for duplicate detection ----
    const existing = await query(
        `SELECT category, amount
         FROM expenses
         WHERE expense_date BETWEEN $1 AND $2
           AND company_id = $3
           AND branch_id  = $4`,
        [isoDate(firstOfThisMonth), isoDate(lastOfThisMonth), companyId, branchId]
    );

    // Duplicate key: "<category>|<amount to 2dp>"
    const existingKeys = new Set(
        existing.rows.map(r => `${r.category}|${parseFloat(r.amount).toFixed(2)}`)
    );

    // ---- 3. Insert copies, skipping duplicates ----
    const created = [];
    const skipped = [];

    for (const row of prev.rows) {
        const key = `${row.category}|${parseFloat(row.amount).toFixed(2)}`;

        if (existingKeys.has(key)) {
            skipped.push({ category: row.category, amount: row.amount });
            continue;
        }

        const description = row.description
            ? `${row.description} (copied from last month)`
            : 'Copied from last month';

        const insert = await query(
            `INSERT INTO expenses (company_id, branch_id, user_id, category, amount, description, expense_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [companyId, branchId, userId, row.category, row.amount, description, todayIso]
        );

        created.push(insert.rows[0]);
        existingKeys.add(key); // guard against duplicate rows in prev month
    }

    // ---- 4. Respond ----
    const copiedCount = created.length;
    const skippedCount = skipped.length;

    let message;
    if (copiedCount === 0) {
        message = `Nothing to copy — all ${skippedCount} expense(s) from last month already exist this month.`;
    } else if (skippedCount === 0) {
        message = `Copied ${copiedCount} expense(s) from last month.`;
    } else {
        message = `Copied ${copiedCount} expense(s). Skipped ${skippedCount} that already existed this month.`;
    }

    res.status(201).json({
        success: true,
        message,
        data: {
            created,
            copied_count: copiedCount,
            skipped_count: skippedCount
        }
    });
});