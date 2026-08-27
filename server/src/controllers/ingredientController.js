import { query } from '../config/database.js';
import { AppError, catchAsync } from '../middleware/errorHandler.js';

// ============================================
// GET ALL INGREDIENTS (Branch-filtered)
// ============================================
export const getAllIngredients = catchAsync(async (req, res) => {
    const { category, lowStock, search } = req.query;
    const branchId = req.user.branch_id || req.query.branchId;
    
    let sql = `
        SELECT id, name, unit, quantity, min_stock, unit_cost, 
               category, supplier, default_wastage_percentage, 
               default_cooking_loss_percentage, safety_stock,
               last_used, created_at, updated_at
        FROM ingredients
        WHERE branch_id = $1
    `;
    const params = [branchId];
    let paramIndex = 2;
    
    if (category) {
        sql += ` AND category = $${paramIndex++}`;
        params.push(category);
    }
    
    if (lowStock === 'true') {
        sql += ` AND quantity <= min_stock`;
    }
    
    if (search) {
        sql += ` AND name ILIKE $${paramIndex++}`;
        params.push(`%${search}%`);
    }
    
    sql += ` ORDER BY name`;
    
    const result = await query(sql, params);
    
    res.json({ success: true, data: result.rows });
});

// ============================================
// GET LOW STOCK (Branch-filtered)
// ============================================
export const getLowStock = catchAsync(async (req, res) => {
    const branchId = req.user.branch_id || req.query.branchId;
    
    const result = await query(`
        SELECT id, name, unit, quantity, min_stock, category,
               safety_stock, (quantity + safety_stock) as effective_stock
        FROM ingredients
        WHERE branch_id = $1 AND quantity <= min_stock
        ORDER BY (quantity / NULLIF(min_stock, 0)) ASC
    `, [branchId]);
    
    res.json({ success: true, data: result.rows });
});

// ============================================
// GET LOW STOCK ALERT (Branch-filtered)
// ============================================
export const getLowStockAlert = catchAsync(async (req, res) => {
    const branchId = req.user.branch_id || req.query.branchId;
    
    const result = await query(`
        SELECT 
            id, 
            name, 
            unit, 
            quantity, 
            min_stock,
            safety_stock,
            (quantity + safety_stock) as effective_stock,
            (min_stock - quantity) as needed,
            category,
            supplier,
            CASE 
                WHEN quantity <= 0 THEN 'out_of_stock'
                WHEN quantity <= min_stock THEN 'critical'
                WHEN quantity <= min_stock + safety_stock THEN 'low'
                ELSE 'ok'
            END as stock_status
        FROM ingredients
        WHERE branch_id = $1 AND quantity <= min_stock
        ORDER BY (quantity / NULLIF(min_stock, 0)) ASC
    `, [branchId]);
    
    res.json({ 
        success: true, 
        data: result.rows,
        count: result.rows.length
    });
});

// ============================================
// GET INGREDIENT BY ID (Branch-validated)
// ============================================
export const getIngredientById = catchAsync(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branch_id || req.query.branchId;
    
    const result = await query(
        `SELECT * FROM ingredients WHERE id = $1 AND branch_id = $2`,
        [id, branchId]
    );
    
    if (result.rows.length === 0) {
        throw new AppError('Ingredient not found', 404);
    }
    
    res.json({ success: true, data: result.rows[0] });
});

// ============================================
// GET INGREDIENT CATEGORIES (Company-level)
// ============================================
export const getIngredientCategories = catchAsync(async (req, res) => {
    const companyId = req.user.company_id || req.query.companyId;
    
    const result = await query(
        `SELECT DISTINCT category FROM ingredients 
         WHERE company_id = $1 AND category IS NOT NULL 
         ORDER BY category`,
        [companyId]
    );
    
    res.json({ success: true, data: result.rows.map(r => r.category) });
});

// ============================================
// CREATE INGREDIENT
// ============================================
export const createIngredient = catchAsync(async (req, res) => {
    const { 
        name, unit, quantity, min_stock, unit_cost, 
        category, supplier, default_wastage_percentage,
        default_cooking_loss_percentage, safety_stock 
    } = req.body;
    
    // Always use authenticated user's company and branch
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id || req.body.branchId;
    
    if (!name || !unit) {
        throw new AppError('Name and unit are required', 400);
    }
    
    const result = await query(`
        INSERT INTO ingredients (
            company_id, branch_id, name, unit, quantity, min_stock, unit_cost, 
            category, supplier, default_wastage_percentage,
            default_cooking_loss_percentage, safety_stock
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id, name, unit, quantity, min_stock, unit_cost, 
                  category, supplier, default_wastage_percentage,
                  default_cooking_loss_percentage, safety_stock
    `, [
        companyId, branchId, name.trim(), unit, quantity || 0, min_stock || 0, 
        unit_cost || 0, category, supplier,
        default_wastage_percentage || 0,
        default_cooking_loss_percentage || 0,
        safety_stock || 0
    ]);
    
    res.status(201).json({
        success: true,
        message: 'Ingredient created successfully',
        data: result.rows[0]
    });
});

// ============================================
// UPDATE INGREDIENT (Branch-validated)
// ============================================
export const updateIngredient = catchAsync(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branch_id || req.body.branchId;
    const { 
        name, unit, quantity, min_stock, unit_cost, 
        category, supplier, default_wastage_percentage, 
        default_cooking_loss_percentage, safety_stock 
    } = req.body;

    const result = await query(`
        UPDATE ingredients 
        SET name = COALESCE($1, name),
            unit = COALESCE($2, unit),
            quantity = COALESCE($3, quantity),
            min_stock = COALESCE($4, min_stock),
            unit_cost = COALESCE($5, unit_cost),
            category = COALESCE($6, category),
            supplier = COALESCE($7, supplier),
            default_wastage_percentage = COALESCE($8, default_wastage_percentage),
            default_cooking_loss_percentage = COALESCE($9, default_cooking_loss_percentage),
            safety_stock = COALESCE($10, safety_stock),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $11 AND branch_id = $12
        RETURNING *
    `, [
        name, unit, quantity, min_stock, unit_cost, 
        category, supplier, 
        default_wastage_percentage || 0, 
        default_cooking_loss_percentage || 0, 
        safety_stock || 0,
        id, branchId
    ]);

    if (result.rows.length === 0) {
        throw new AppError('Ingredient not found', 404);
    }

    res.json({
        success: true,
        message: 'Ingredient updated successfully',
        data: result.rows[0]
    });
});

// ============================================
// DELETE INGREDIENT (Branch-validated)
// ============================================
export const deleteIngredient = catchAsync(async (req, res) => {
    const { id } = req.params;
    const branchId = req.user.branch_id || req.body.branchId;
    
    // Check if ingredient is used in recipes
    const recipeCheck = await query(
        'SELECT COUNT(*) FROM recipe_ingredients WHERE ingredient_id = $1',
        [id]
    );
    
    if (parseInt(recipeCheck.rows[0].count) > 0) {
        throw new AppError('Cannot delete ingredient that is used in recipes', 400);
    }
    
    const result = await query(
        'DELETE FROM ingredients WHERE id = $1 AND branch_id = $2 RETURNING id',
        [id, branchId]
    );
    
    if (result.rows.length === 0) {
        throw new AppError('Ingredient not found', 404);
    }
    
    res.json({
        success: true,
        message: 'Ingredient deleted successfully'
    });
});

// ============================================
// ADJUST STOCK (Branch-validated)
// ============================================
export const adjustStock = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { amount, reason } = req.body;
    const branchId = req.user.branch_id || req.body.branchId;
    
    // Verify ingredient exists in this branch
    const currentIngredient = await query(
        'SELECT name, quantity, unit FROM ingredients WHERE id = $1 AND branch_id = $2',
        [id, branchId]
    );
    
    if (currentIngredient.rows.length === 0) {
        throw new AppError('Ingredient not found', 404);
    }
    
    const currentQuantity = parseFloat(currentIngredient.rows[0].quantity);
    const newQuantity = currentQuantity + parseFloat(amount);
    
    if (newQuantity < 0) {
        throw new AppError('Cannot reduce stock below zero', 400);
    }
    
    const result = await query(`
        UPDATE ingredients 
        SET quantity = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND branch_id = $3
        RETURNING *
    `, [newQuantity, id, branchId]);
    
    // Record stock transaction
    const transactionType = amount > 0 ? 'adjustment_add' : 'adjustment_remove';
    await query(`
        INSERT INTO stock_transactions (
            ingredient_id, branch_id, expected_quantity, actual_quantity,
            wastage_amount, wastage_percentage, transaction_type, notes
        ) VALUES ($1, $2, $3, $4, 0, 0, $5, $6)
    `, [id, branchId, Math.abs(amount), Math.abs(amount), transactionType, reason || 'Manual adjustment']);
    
    const action = amount > 0 ? 'added to' : 'removed from';
    const absAmount = Math.abs(amount);
    
    res.json({
        success: true,
        message: `${absAmount} ${result.rows[0].unit} ${action} ${result.rows[0].name}`,
        data: result.rows[0]
    });
});