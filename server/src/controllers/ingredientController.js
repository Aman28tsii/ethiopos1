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
               bottle_size_ml,                      -- ★ NEW
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
            id, name, unit, quantity, min_stock, safety_stock,
            (quantity + safety_stock) as effective_stock,
            (min_stock - quantity) as needed,
            category, supplier,
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
    
    res.json({ success: true, data: result.rows, count: result.rows.length });
});

// ============================================================
// GET INGREDIENT BY ID (Branch-validated) — SELECT * includes bottle_size_ml
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
// CREATE INGREDIENT (Branch-validated)
// ============================================================
export const createIngredient = catchAsync(async (req, res) => {
    const { 
        name, unit, quantity, min_stock, unit_cost, 
        category, supplier, default_wastage_percentage,
        default_cooking_loss_percentage, safety_stock,
        bottle_size_ml                       // ★ NEW
    } = req.body;
    
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    if (!name || !unit) {
        throw new AppError('Name and unit are required', 400);
    }

    // ★ NEW: validate bottle_size_ml if provided
    let bottleSize = null;
    if (bottle_size_ml !== undefined && bottle_size_ml !== null && bottle_size_ml !== '') {
        const parsed = parseInt(bottle_size_ml, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            throw new AppError('bottle_size_ml must be a positive integer', 400);
        }
        bottleSize = parsed;
    }
    
    const initialQuantity = parseFloat(quantity) || 0;
    
    const client = await getClient();
    
    try {
        await client.query('BEGIN');
        
        const result = await client.query(`
            INSERT INTO ingredients (
                company_id, branch_id, name, unit, quantity, min_stock, unit_cost, 
                category, supplier, default_wastage_percentage,
                default_cooking_loss_percentage, safety_stock, bottle_size_ml
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING id, name, unit, quantity, min_stock, unit_cost, 
                      category, supplier, default_wastage_percentage,
                      default_cooking_loss_percentage, safety_stock, bottle_size_ml
        `, [
            companyId, branchId, name.trim(), unit, initialQuantity, min_stock || 0, 
            unit_cost || 0, category, supplier,
            default_wastage_percentage || 0,
            default_cooking_loss_percentage || 0,
            safety_stock || 0,
            bottleSize
        ]);
        
        const ingredient = result.rows[0];
        
        if (initialQuantity > 0) {
            const auditResult = await client.query(`
                INSERT INTO stock_transactions (
                    ingredient_id, expected_quantity, actual_quantity,
                    wastage_amount, wastage_percentage, transaction_type,
                    notes, company_id, branch_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id
            `, [
                ingredient.id, initialQuantity, initialQuantity, 0, 0,
                'opening_stock',
                `Initial stock for ${ingredient.name}`,
                companyId, branchId
            ]);

            if (!auditResult.rows || auditResult.rows.length === 0) {
                throw new Error('Audit trail failure: stock_transactions insert returned no rows.');
            }
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
        throw new AppError(`Create ingredient failed: ${error.message || 'unknown error'}`, 500);
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
        default_cooking_loss_percentage, safety_stock,
        bottle_size_ml                       // ★ NEW
    } = req.body;
    
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;

    // ★ NEW: normalize bottle_size_ml
    //   - undefined  → don't touch (COALESCE keeps existing)
    //   - '' or null → set to NULL (remove bottle tracking)
    //   - positive   → set value
    let bottleSizeParam = undefined;
    if (bottle_size_ml !== undefined) {
        if (bottle_size_ml === null || bottle_size_ml === '') {
            bottleSizeParam = null;
        } else {
            const parsed = parseInt(bottle_size_ml, 10);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                throw new AppError('bottle_size_ml must be a positive integer', 400);
            }
            bottleSizeParam = parsed;
        }
    }

    // ★ FIX: COALESCE can't distinguish "set to NULL" from "don't touch".
    //   Use a CASE with a sentinel ($14) that indicates whether the field was provided.
    const bottleProvided = bottle_size_ml !== undefined;

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
            bottle_size_ml = CASE WHEN $11 THEN $12 ELSE bottle_size_ml END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $13 AND company_id = $14 AND branch_id = $15
        RETURNING *
    `, [
        name, unit, quantity, min_stock, unit_cost, 
        category, supplier, 
        default_wastage_percentage || 0, 
        default_cooking_loss_percentage || 0, 
        safety_stock || 0,
        bottleProvided,
        bottleSizeParam,
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
    
    res.json({ success: true, message: 'Ingredient deleted successfully' });
});

// ============================================================
// ADJUST STOCK (Branch-validated)
// ============================================================
export const adjustStock = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { amount, reason } = req.body;
    
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
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
    
    const idempotencyKey = req.headers['idempotency-key'];
    let recordId = null;
    
    if (idempotencyKey) {
        const existing = await query(
            `SELECT id, response_data, request_hash FROM idempotency_records 
             WHERE idempotency_key = $1 AND company_id = $2 AND branch_id = $3 
               AND resource_type = 'stock_adjustment' AND resource_id = $4
               AND status = 'completed'`,
            [idempotencyKey, companyId, branchId, id]
        );
        
        if (existing.rows.length > 0) {
            return res.status(200).json(existing.rows[0].response_data);
        }
        
        const conflicting = await query(
            `SELECT id, request_hash, status FROM idempotency_records 
             WHERE idempotency_key = $1 AND company_id = $2 AND branch_id = $3 
               AND resource_type = 'stock_adjustment' AND resource_id = $4`,
            [idempotencyKey, companyId, branchId, id]
        );
        
        if (conflicting.rows.length > 0) {
            const requestHash = crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
            if (conflicting.rows[0].request_hash !== requestHash) {
                throw new AppError('Idempotency key reused with different request payload', 409);
            }
            if (conflicting.rows[0].status === 'processing') {
                throw new AppError('Duplicate request is being processed', 409);
            }
        }
    }
    
    const client = await getClient();
    
    try {
        await client.query('BEGIN');
        
        if (idempotencyKey) {
            const requestHash = crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
            const insertResult = await client.query(
                `INSERT INTO idempotency_records 
                 (idempotency_key, company_id, branch_id, resource_type, resource_id, 
                  request_hash, status, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, 'processing', NOW(), NOW())
                 RETURNING id`,
                [idempotencyKey, companyId, branchId, 'stock_adjustment', parseInt(id), requestHash]
            );
            recordId = insertResult.rows[0].id;
        }
        
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
        
        if (newQuantity < 0) {
            throw new AppError(`Cannot reduce stock below zero. Current: ${currentQuantity}, Requested: ${Math.abs(numericAmount)}`, 400);
        }
        
        const updateResult = await client.query(`
            UPDATE ingredients SET quantity = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2 AND company_id = $3 AND branch_id = $4
            RETURNING *
        `, [newQuantity, id, companyId, branchId]);
        
        const transactionType = numericAmount > 0 ? 'adjustment_add' : 'adjustment_remove';
        const absAmount = Math.abs(numericAmount);
        
        const auditResult = await client.query(`
            INSERT INTO stock_transactions (
                ingredient_id, expected_quantity, actual_quantity,
                wastage_amount, wastage_percentage, transaction_type,
                notes, company_id, branch_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id
        `, [
            id, absAmount, absAmount, 0, 0, transactionType,
            reason || (numericAmount > 0 ? 'Manual stock addition' : 'Manual stock removal'),
            companyId, branchId
        ]);

        if (!auditResult.rows || auditResult.rows.length === 0) {
            throw new Error('Audit trail failure: stock_transactions insert returned no rows.');
        }
        
        const action = numericAmount > 0 ? 'added to' : 'removed from';
        const responseData = {
            success: true,
            message: `${absAmount} ${ingredient.unit} ${action} ${ingredient.name}`,
            data: updateResult.rows[0]
        };
        
        if (recordId) {
            await client.query(
                `UPDATE idempotency_records 
                 SET status = 'completed', response_data = $1, status_code = 200, updated_at = NOW()
                 WHERE id = $2`,
                [responseData, recordId]
            );
        }
        
        await client.query('COMMIT');
        res.json(responseData);
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Adjust stock error:', error);
        const statusCode = error.statusCode || 500;
        const message = error.isOperational
            ? error.message
            : `Adjust stock failed: ${error.message || 'unknown error'}`;
        throw new AppError(message, statusCode);
    } finally {
        client.release();
    }
});

// ============================================================
// ★ NEW — MARK BOTTLE EMPTY
//
// Deducts exactly one bottle (bottle_size_ml) from stock.
// Only valid for ingredients with bottle_size_ml > 0.
// Records an audit row in stock_transactions.
// ============================================================
export const markBottleEmpty = catchAsync(async (req, res) => {
    const { id } = req.params;
    
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    const client = await getClient();
    
    try {
        await client.query('BEGIN');
        
        const lockResult = await client.query(
            `SELECT id, name, unit, quantity, bottle_size_ml
             FROM ingredients
             WHERE id = $1 AND company_id = $2 AND branch_id = $3
             FOR UPDATE`,
            [id, companyId, branchId]
        );
        
        if (lockResult.rows.length === 0) {
            throw new AppError('Ingredient not found', 404);
        }
        
        const ingredient = lockResult.rows[0];
        const bottleSize = parseFloat(ingredient.bottle_size_ml);
        
        if (!bottleSize || bottleSize <= 0) {
            throw new AppError('This ingredient is not tracked by bottles', 400);
        }
        
        const currentQty = parseFloat(ingredient.quantity);
        const newQty = currentQty - bottleSize;
        
        if (newQty < 0) {
            throw new AppError(`Not enough stock. Current: ${currentQty} ml, Bottle size: ${bottleSize} ml`, 400);
        }
        
        await client.query(
            `UPDATE ingredients SET quantity = $1, updated_at = NOW()
             WHERE id = $2 AND company_id = $3 AND branch_id = $4`,
            [newQty, id, companyId, branchId]
        );
        
        const auditResult = await client.query(`
            INSERT INTO stock_transactions (
                ingredient_id, expected_quantity, actual_quantity,
                wastage_amount, wastage_percentage, transaction_type,
                notes, company_id, branch_id
            ) VALUES ($1, $2, $3, 0, 0, 'bottle_empty', $4, $5, $6)
            RETURNING id
        `, [
            id, bottleSize, bottleSize,
            `Bottle marked empty (${bottleSize} ml)`,
            companyId, branchId
        ]);

        if (!auditResult.rows || auditResult.rows.length === 0) {
            throw new Error('Audit trail failure: stock_transactions insert returned no rows.');
        }
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            message: `Bottle marked empty. ${bottleSize} ${ingredient.unit} deducted from ${ingredient.name}.`,
            data: {
                ingredient_id: parseInt(id),
                deducted: bottleSize,
                remaining: newQty
            }
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('markBottleEmpty error:', error);
        const statusCode = error.statusCode || 500;
        const message = error.isOperational ? error.message : `Mark bottle empty failed: ${error.message}`;
        throw new AppError(message, statusCode);
    } finally {
        client.release();
    }
});

// ============================================================
// ★ NEW — RECORD BROKEN BOTTLE
//
// Deducts one bottle from stock and records it as wastage.
// Requires a reason (defaults to "Broken bottle").
// ============================================================
export const recordBrokenBottle = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    const client = await getClient();
    
    try {
        await client.query('BEGIN');
        
        const lockResult = await client.query(
            `SELECT id, name, unit, quantity, bottle_size_ml, unit_cost
             FROM ingredients
             WHERE id = $1 AND company_id = $2 AND branch_id = $3
             FOR UPDATE`,
            [id, companyId, branchId]
        );
        
        if (lockResult.rows.length === 0) {
            throw new AppError('Ingredient not found', 404);
        }
        
        const ingredient = lockResult.rows[0];
        const bottleSize = parseFloat(ingredient.bottle_size_ml);
        
        if (!bottleSize || bottleSize <= 0) {
            throw new AppError('This ingredient is not tracked by bottles', 400);
        }
        
        const currentQty = parseFloat(ingredient.quantity);
        const newQty = currentQty - bottleSize;
        
        if (newQty < 0) {
            throw new AppError(`Not enough stock. Current: ${currentQty} ml, Bottle size: ${bottleSize} ml`, 400);
        }
        
        await client.query(
            `UPDATE ingredients SET quantity = $1, updated_at = NOW()
             WHERE id = $2 AND company_id = $3 AND branch_id = $4`,
            [newQty, id, companyId, branchId]
        );
        
        const auditResult = await client.query(`
            INSERT INTO stock_transactions (
                ingredient_id, expected_quantity, actual_quantity,
                wastage_amount, wastage_percentage, transaction_type,
                notes, company_id, branch_id
            ) VALUES ($1, $2, $3, $4, $5, 'bottle_broken', $6, $7, $8)
            RETURNING id
        `, [
            id,
            bottleSize,
            bottleSize,
            bottleSize,   // full bottle is wastage
            100,          // 100% wastage
            reason || 'Broken bottle',
            companyId,
            branchId
        ]);

        if (!auditResult.rows || auditResult.rows.length === 0) {
            throw new Error('Audit trail failure: stock_transactions insert returned no rows.');
        }
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            message: `Broken bottle recorded. ${bottleSize} ${ingredient.unit} deducted from ${ingredient.name}.`,
            data: {
                ingredient_id: parseInt(id),
                deducted: bottleSize,
                remaining: newQty,
                reason: reason || 'Broken bottle'
            }
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('recordBrokenBottle error:', error);
        const statusCode = error.statusCode || 500;
        const message = error.isOperational ? error.message : `Record broken bottle failed: ${error.message}`;
        throw new AppError(message, statusCode);
    } finally {
        client.release();
    }
});