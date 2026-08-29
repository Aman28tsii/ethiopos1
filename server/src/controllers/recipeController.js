// server/src/controllers/recipeController.js

import { query, getClient } from '../config/database.js';
import { AppError, catchAsync } from '../middleware/errorHandler.js';

// ============================================
// GET ALL RECIPES (Company-level)
// ============================================
export const getAllRecipes = catchAsync(async (req, res) => {
    if (!req.user?.company_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    
    const result = await query(`
        SELECT 
            r.id as recipe_id,
            r.product_id,
            r.yield_quantity,
            p.name as product_name,
            p.price as selling_price,
            p.category,
            p.company_id,
            COALESCE(
                json_agg(
                    json_build_object(
                        'id', ri.id,
                        'ingredient_id', ri.ingredient_id,
                        'ingredient_name', i.name,
                        'quantity_required', ri.quantity_required,
                        'unit', i.unit,
                        'unit_cost', i.unit_cost,
                        'wastage_percentage', ri.wastage_percentage,
                        'cooking_loss_percentage', ri.cooking_loss_percentage,
                        'cost_per_product', ROUND((ri.quantity_required * i.unit_cost)::numeric, 2)
                    )
                ) FILTER (WHERE ri.id IS NOT NULL),
                '[]'
            ) as ingredients
        FROM recipes r
        JOIN products p ON r.product_id = p.id
        LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
        LEFT JOIN ingredients i ON ri.ingredient_id = i.id
        WHERE p.company_id = $1
        GROUP BY r.id, p.name, p.price, p.category, p.company_id
        ORDER BY p.name
    `, [companyId]);

    res.json({ success: true, data: result.rows });
});

// ============================================
// GET RECIPE BY PRODUCT (Company-validated)
// ============================================
export const getRecipeByProduct = catchAsync(async (req, res) => {
    const { productId } = req.params;
    
    if (!req.user?.company_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;

    const productResult = await query(
        'SELECT id, name, price, category, company_id FROM products WHERE id = $1 AND company_id = $2',
        [productId, companyId]
    );

    if (productResult.rows.length === 0) {
        throw new AppError('Product not found', 404);
    }

    const recipeResult = await query(`
        SELECT 
            r.id as recipe_id,
            r.yield_quantity,
            COALESCE(
                json_agg(
                    json_build_object(
                        'id', ri.id,
                        'ingredient_id', ri.ingredient_id,
                        'ingredient_name', i.name,
                        'quantity_required', ri.quantity_required,
                        'unit', i.unit,
                        'unit_cost', i.unit_cost,
                        'wastage_percentage', ri.wastage_percentage,
                        'cooking_loss_percentage', ri.cooking_loss_percentage,
                        'current_stock', i.quantity,
                        'cost_per_product', ROUND((ri.quantity_required * i.unit_cost)::numeric, 2)
                    )
                ) FILTER (WHERE ri.id IS NOT NULL),
                '[]'
            ) as ingredients
        FROM recipes r
        LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
        LEFT JOIN ingredients i ON ri.ingredient_id = i.id
        WHERE r.product_id = $1
        GROUP BY r.id
    `, [productId]);

    const product = productResult.rows[0];
    const recipe = recipeResult.rows[0] || { recipe_id: null, yield_quantity: 1, ingredients: [] };
    
    let totalCost = 0;
    let totalWithWastage = 0;
    
    recipe.ingredients.forEach(ing => {
        const qty = parseFloat(ing.quantity_required) || 0;
        const cost = parseFloat(ing.unit_cost) || 0;
        const wastage = parseFloat(ing.wastage_percentage) || 0;
        const cookingLoss = parseFloat(ing.cooking_loss_percentage) || 0;
        
        totalCost += qty * cost;
        const effectiveQty = qty * (1 + wastage / 100) * (1 + cookingLoss / 100);
        totalWithWastage += effectiveQty * cost;
    });
    
    const sellingPrice = parseFloat(product.price);

    res.json({
        success: true,
        data: {
            product_id: parseInt(productId),
            product_name: product.name,
            product_category: product.category,
            selling_price: sellingPrice,
            recipe_id: recipe.recipe_id,
            yield_quantity: recipe.yield_quantity,
            total_ingredient_cost: parseFloat(totalCost.toFixed(2)),
            total_cost_with_wastage: parseFloat(totalWithWastage.toFixed(2)),
            profit: parseFloat((sellingPrice - totalWithWastage).toFixed(2)),
            profit_margin: sellingPrice > 0 ? parseFloat(((sellingPrice - totalWithWastage) / sellingPrice * 100).toFixed(2)) : 0,
            ingredients: recipe.ingredients
        }
    });
});

// ============================================
// CREATE OR UPDATE RECIPE (Company-validated)
// ============================================
export const createOrUpdateRecipe = catchAsync(async (req, res) => {
    const { productId } = req.params;
    const { yield_quantity = 1, ingredients } = req.body;
    
    if (!req.user?.company_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;

    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
        throw new AppError('At least one ingredient is required', 400);
    }

    const productCheck = await query(
        'SELECT id FROM products WHERE id = $1 AND company_id = $2',
        [productId, companyId]
    );
    if (productCheck.rows.length === 0) {
        throw new AppError('Product not found', 404);
    }

    const client = await getClient();

    try {
        await client.query('BEGIN');

        const existingRecipe = await client.query(
            'SELECT id FROM recipes WHERE product_id = $1',
            [productId]
        );

        let recipeId;
        if (existingRecipe.rows.length > 0) {
            recipeId = existingRecipe.rows[0].id;
            await client.query(
                'UPDATE recipes SET yield_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [yield_quantity, recipeId]
            );
            await client.query(
                'DELETE FROM recipe_ingredients WHERE recipe_id = $1',
                [recipeId]
            );
        } else {
            const result = await client.query(
                `INSERT INTO recipes (product_id, yield_quantity) 
                 VALUES ($1, $2) RETURNING id`,
                [productId, yield_quantity]
            );
            recipeId = result.rows[0].id;
        }

        for (const item of ingredients) {
            if (!item.ingredient_id || !item.quantity_required || item.quantity_required <= 0) {
                throw new AppError('Each ingredient requires valid ingredient_id and quantity_required', 400);
            }

            const ingredientCheck = await client.query(
                'SELECT id, unit FROM ingredients WHERE id = $1',
                [item.ingredient_id]
            );

            if (ingredientCheck.rows.length === 0) {
                throw new AppError(`Ingredient ID ${item.ingredient_id} not found`, 404);
            }

            await client.query(
                `INSERT INTO recipe_ingredients (
                    recipe_id, ingredient_id, quantity_required, 
                    wastage_percentage, cooking_loss_percentage
                ) VALUES ($1, $2, $3, $4, $5)`,
                [
                    recipeId, 
                    item.ingredient_id, 
                    item.quantity_required,
                    item.wastage_percentage || 0,
                    item.cooking_loss_percentage || 0
                ]
            );
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Recipe saved successfully',
            data: { recipe_id: recipeId, product_id: productId }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
});

// ============================================
// DELETE RECIPE (Company-validated)
// ============================================
export const deleteRecipe = catchAsync(async (req, res) => {
    const { id } = req.params;
    
    if (!req.user?.company_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;

    const result = await query(
        'DELETE FROM recipes WHERE id = $1 AND product_id IN (SELECT id FROM products WHERE company_id = $2) RETURNING id',
        [id, companyId]
    );

    if (result.rows.length === 0) {
        throw new AppError('Recipe not found', 404);
    }

    res.json({
        success: true,
        message: 'Recipe deleted successfully'
    });
});

// ============================================
// DELETE RECIPE INGREDIENT (Company-validated)
// ============================================
export const deleteRecipeIngredient = catchAsync(async (req, res) => {
    const { id } = req.params;
    
    if (!req.user?.company_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;

    const result = await query(
        `DELETE FROM recipe_ingredients 
         WHERE id = $1 
         AND recipe_id IN (SELECT id FROM recipes WHERE product_id IN (SELECT id FROM products WHERE company_id = $2))
         RETURNING id`,
        [id, companyId]
    );

    if (result.rows.length === 0) {
        throw new AppError('Recipe ingredient not found', 404);
    }

    res.json({
        success: true,
        message: 'Recipe ingredient removed successfully'
    });
});

// ============================================
// GET PRODUCT COST (Company-validated)
// ============================================
export const getProductCost = catchAsync(async (req, res) => {
    const { productId } = req.params;
    
    if (!req.user?.company_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    
    const result = await query(`
        SELECT 
            p.id,
            p.name,
            p.price as selling_price,
            p.company_id,
            COALESCE(SUM(ri.quantity_required * i.unit_cost), 0) as ingredient_cost,
            COALESCE(SUM(ri.quantity_required * i.unit_cost * (1 + ri.wastage_percentage/100) * (1 + ri.cooking_loss_percentage/100)), 0) as cost_with_wastage
        FROM products p
        LEFT JOIN recipes r ON p.id = r.product_id
        LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
        LEFT JOIN ingredients i ON ri.ingredient_id = i.id
        WHERE p.id = $1 AND p.company_id = $2
        GROUP BY p.id, p.name, p.price, p.company_id
    `, [productId, companyId]);
    
    if (result.rows.length === 0) {
        throw new AppError('Product not found', 404);
    }
    
    const product = result.rows[0];
    const ingredientCost = parseFloat(product.ingredient_cost) || 0;
    const costWithWastage = parseFloat(product.cost_with_wastage) || 0;
    const sellingPrice = parseFloat(product.selling_price) || 0;
    
    res.json({
        success: true,
        data: {
            product_id: parseInt(productId),
            product_name: product.name,
            selling_price: sellingPrice,
            ingredient_cost: parseFloat(ingredientCost.toFixed(2)),
            cost_with_wastage: parseFloat(costWithWastage.toFixed(2)),
            profit: parseFloat((sellingPrice - costWithWastage).toFixed(2)),
            profit_margin: sellingPrice > 0 ? parseFloat(((sellingPrice - costWithWastage) / sellingPrice * 100).toFixed(2)) : 0
        }
    });
});