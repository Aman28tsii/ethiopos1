// server/src/controllers/ingredientController.js

import { query, getClient } from '../config/database.js';
import { AppError, catchAsync } from '../middleware/errorHandler.js';
import crypto from 'crypto';

// ============================================================
// GET ALL INGREDIENTS (Branch-isolated)
// ============================================================
export const getAllIngredients = catchAsync(async (req, res) => {
    const { category, lowStock, search } = req.query;
    
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    let sql = `
        SELECT id, name, unit, quantity, min_stock, unit_cost, 
               category, supplier, default_wastage_percentage, 
               default_cooking_loss_percentage, safety_stock,
               last_used, created_at, updated_at
        FROM ingredients
        WHERE company_id = $1 AND branch_id = $2
    `;
    const params = [companyId, branchId];
    let paramIndex = 3;
    
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

// ============================================================
// GET LOW STOCK (Branch-isolated)
// ============================================================
export const getLowStock = catchAsync(async (req, res) => {
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    const result = await query(`
        SELECT id, name, unit, quantity, min_stock, category,
               safety_stock, (quantity + safety_stock) as effective_stock
        FROM ingredients
        WHERE company_id = $1 AND branch_id = $2 AND quantity <= min_stock
        ORDER BY (quantity / NULLIF(min_stock, 0)) ASC
    `, [companyId, branchId]);
    
    res.json({ success: true, data: result.rows });
});

// ============================================================
// GET LOW STOCK ALERT (Branch-isolated)
// ============================================================
export const getLowStockAlert = catchAsync(async (req, res) => {
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
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
        WHERE company_id = $1 AND branch_id = $2 AND quantity <= min_stock
        ORDER BY (quantity / NULLIF(min_stock, 0)) ASC
    `, [companyId, branchId]);
    
    res.json({ 
        success: true, 
        data: result.rows,
        count: result.rows.length
    });
});

// ============================================================
// GET INGREDIENT BY ID (Branch-validated)
// ============================================================
export const getIngredientById = catchAsync(async (req, res) => {
    const { id } = req.params;
    
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    const result = await query(
        `SELECT * FROM ingredients WHERE id = $1 AND company_id = $2 AND branch_id = $3`,
        [id, companyId, branchId]
    );
    
    if (result.rows.length === 0) {
        throw new AppError('Ingredient not found', 404);
    }
    
    res.json({ success: true, data: result.rows[0] });
});

// ============================================================
// GET INGREDIENT CATEGORIES (Company-level)
// ============================================================
export const getIngredientCategories = catchAsync(async (req, res) => {
    if (!req.user?.company_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    
    const result = await query(
        `SELECT DISTINCT category FROM ingredients 
         WHERE company_id = $1 AND category IS NOT NULL 
         ORDER BY category`,
        [companyId]
    );
    
    res.json({ success: true, data: result.rows.map(r => r.category) });
});

// ============================================================
// CREATE INGREDIENT (Branch-validated) - WITH OPENING STOCK AUDIT TRAIL (INV-004 FIX 3)
// ============================================================
export const createIngredient = catchAsync(async (req, res) => {
    const { 
        name, unit, quantity, min_stock, unit_cost, 
        category, supplier, default_wastage_percentage,
        default_cooking_loss_percentage, safety_stock 
    } = req.body;
    
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    if (!name || !unit) {
        throw new AppError('Name and unit are required', 400);
    }
    
    // Parse initial quantity
    const initialQuantity = parseFloat(quantity) || 0;
    
    const client = await getClient();
    
    try {
        await client.query('BEGIN');
        
        // Create the ingredient
        const result = await client.query(`
            INSERT INTO ingredients (
                company_id, branch_id, name, unit, quantity, min_stock, unit_cost, 
                category, supplier, default_wastage_percentage,
                default_cooking_loss_percentage, safety_stock
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id, name, unit, quantity, min_stock, unit_cost, 
                      category, supplier, default_wastage_percentage,
                      default_cooking_loss_percentage, safety_stock
        `, [
            companyId, branchId, name.trim(), unit, initialQuantity, min_stock || 0, 
            unit_cost || 0, category, supplier,
            default_wastage_percentage || 0,
            default_cooking_loss_percentage || 0,
            safety_stock || 0
        ]);
        
        const ingredient = result.rows[0];
        
        // Fix 3: Create opening_stock transaction if initial quantity > 0
        if (initialQuantity > 0) {
            await client.query(`
                INSERT INTO stock_transactions (
                    ingredient_id,
                    expected_quantity,
                    actual_quantity,
                    wastage_amount,
                    wastage_percentage,
                    transaction_type,
                    notes,
                    company_id,
                    branch_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                ingredient.id,
                initialQuantity,
                initialQuantity,
                0,
                0,
                'opening_stock',
                `Initial stock for ${ingredient.name}`,
                companyId,
                branchId
            ]);
        }
        
        await client.query('COMMIT');
        
        res.status(201).json({
            success: true,
            message: 'Ingredient created successfully',
            data: ingredient
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Create ingredient error:', error);
        throw error;
    } finally {
        client.release();
    }
});

// ============================================================
// UPDATE INGREDIENT (Branch-validated)
// ============================================================
export const updateIngredient = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { 
        name, unit, quantity, min_stock, unit_cost, 
        category, supplier, default_wastage_percentage, 
        default_cooking_loss_percentage, safety_stock 
    } = req.body;
    
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;

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
        WHERE id = $11 AND company_id = $12 AND branch_id = $13
        RETURNING *
    `, [
        name, unit, quantity, min_stock, unit_cost, 
        category, supplier, 
        default_wastage_percentage || 0, 
        default_cooking_loss_percentage || 0, 
        safety_stock || 0,
        id, companyId, branchId
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

// ============================================================
// DELETE INGREDIENT (Branch-validated)
// ============================================================
export const deleteIngredient = catchAsync(async (req, res) => {
    const { id } = req.params;
    
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    // Check if ingredient is used in recipes
    const recipeCheck = await query(
        'SELECT COUNT(*) FROM recipe_ingredients WHERE ingredient_id = $1',
        [id]
    );
    
    if (parseInt(recipeCheck.rows[0].count) > 0) {
        throw new AppError('Cannot delete ingredient that is used in recipes', 400);
    }
    
    const result = await query(
        'DELETE FROM ingredients WHERE id = $1 AND company_id = $2 AND branch_id = $3 RETURNING id',
        [id, companyId, branchId]
    );
    
    if (result.rows.length === 0) {
        throw new AppError('Ingredient not found', 404);
    }
    
    res.json({
        success: true,
        message: 'Ingredient deleted successfully'
    });
});

// ============================================================
// ADJUST STOCK (Branch-validated) - WITH ROW-LEVEL LOCKING, ZERO AMOUNT VALIDATION & IDEMPOTENCY (INV-004 FIX 1 & 2 + INV-005)
// ============================================================
export const adjustStock = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { amount, reason } = req.body;
    
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    // Fix 2: Validate amount is a valid non-zero number
    if (amount === undefined || amount === null || amount === '') {
        throw new AppError('Amount is required', 400);
    }
    
    const numericAmount = parseFloat(amount);
    
    if (isNaN(numericAmount) || !isFinite(numericAmount)) {
        throw new AppError('Amount must be a valid number', 400);
    }
    
    if (numericAmount === 0) {
        throw new AppError('Adjustment amount cannot be zero', 400);
    }
    
    // ============================================================
    // ✅ FIX: IDEMPOTENCY CHECK (INV-005)
    // ============================================================
    const idempotencyKey = req.headers['idempotency-key'];
    let cachedResponse = null;
    
    if (idempotencyKey) {
        console.log(`[IDEMPOTENCY] Checking key: ${idempotencyKey} for ingredient ${id}`);
        
        // Check if this key has been used for this ingredient
        const existing = await query(
            `SELECT id, response_data, request_hash FROM idempotency_records 
             WHERE idempotency_key = $1 
               AND company_id = $2 
               AND branch_id = $3 
               AND resource_type = 'stock_adjustment'
               AND resource_id = $4
               AND status = 'completed'`,
            [idempotencyKey, companyId, branchId, id]
        );
        
        if (existing.rows.length > 0) {
            console.log(`[IDEMPOTENCY] Cache hit for ${idempotencyKey}`);
            // Return cached response
            return res.status(200).json(existing.rows[0].response_data);
        }
        
        // Check for conflicting key with different payload
        const conflicting = await query(
            `SELECT id, request_hash FROM idempotency_records 
             WHERE idempotency_key = $1 
               AND company_id = $2 
               AND branch_id = $3 
               AND resource_type = 'stock_adjustment'
               AND resource_id = $4`,
            [idempotencyKey, companyId, branchId, id]
        );
        
        if (conflicting.rows.length > 0) {
            const requestHash = crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
            if (conflicting.rows[0].request_hash !== requestHash) {
                throw new AppError('Idempotency key reused with different request payload', 409);
            }
        }
    }
    
    const client = await getClient();
    
    try {
        await client.query('BEGIN');
        
        // Fix 1: Row-level lock using FOR UPDATE
        const lockResult = await client.query(`
            SELECT id, name, quantity, unit, unit_cost, company_id, branch_id
            FROM ingredients
            WHERE id = $1 AND company_id = $2 AND branch_id = $3
            FOR UPDATE
        `, [id, companyId, branchId]);
        
        if (lockResult.rows.length === 0) {
            throw new AppError('Ingredient not found', 404);
        }
        
        const ingredient = lockResult.rows[0];
        const currentQuantity = parseFloat(ingredient.quantity);
        const newQuantity = currentQuantity + numericAmount;
        
        // Prevent negative stock
        if (newQuantity < 0) {
            throw new AppError(`Cannot reduce stock below zero. Current: ${currentQuantity}, Requested reduction: ${Math.abs(numericAmount)}`, 400);
        }
        
        // Update the stock
        const updateResult = await client.query(`
            UPDATE ingredients 
            SET quantity = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2 AND company_id = $3 AND branch_id = $4
            RETURNING *
        `, [newQuantity, id, companyId, branchId]);
        
        // Determine transaction type
        const transactionType = numericAmount > 0 ? 'adjustment_add' : 'adjustment_remove';
        const absAmount = Math.abs(numericAmount);
        
        // Record stock transaction
        await client.query(`
            INSERT INTO stock_transactions (
                ingredient_id,
                expected_quantity,
                actual_quantity,
                wastage_amount,
                wastage_percentage,
                transaction_type,
                notes,
                company_id,
                branch_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
            id,
            absAmount,
            absAmount,
            0,
            0,
            transactionType,
            reason || (numericAmount > 0 ? 'Manual stock addition' : 'Manual stock removal'),
            companyId,
            branchId
        ]);
        
        await client.query('COMMIT');
        
        const action = numericAmount > 0 ? 'added to' : 'removed from';
        
        const responseData = {
            success: true,
            message: `${absAmount} ${ingredient.unit} ${action} ${ingredient.name}`,
            data: updateResult.rows[0]
        };
        
        // ✅ Store idempotency record if key was provided
        if (idempotencyKey) {
            const requestHash = crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
            
            await query(
                `INSERT INTO idempotency_records 
                 (idempotency_key, company_id, branch_id, resource_type, resource_id, 
                  request_hash, response_data, status_code, status, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'completed', NOW(), NOW())`,
                [
                    idempotencyKey,
                    companyId,
                    branchId,
                    'stock_adjustment',
                    parseInt(id),
                    requestHash,
                    responseData,
                    200
                ]
            );
            console.log(`[IDEMPOTENCY] Stored result for ${idempotencyKey}`);
        }
        
        res.json(responseData);
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Adjust stock error:', error);
        throw error;
    } finally {
        client.release();
    }
});