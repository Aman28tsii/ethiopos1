// server/src/controllers/saleController.js

import { query, getClient } from '../config/database.js';
import { AppError, catchAsync } from '../middleware/errorHandler.js';

const generateSaleNumber = () => {
    const date = new Date();
    const timestamp = date.getTime().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `SALE-${timestamp}${random}`;
};

// ============================================
// CALCULATE PRODUCT COST
// ============================================
const calculateProductCost = async (productId, quantity, client) => {
    const recipeResult = await client.query(
        `SELECT ri.quantity_required, i.unit_cost, ri.wastage_percentage, ri.cooking_loss_percentage
         FROM recipe_ingredients ri
         JOIN ingredients i ON ri.ingredient_id = i.id
         WHERE ri.recipe_id IN (SELECT id FROM recipes WHERE product_id = $1)`,
        [productId]
    );
    
    let totalCost = 0;
    for (const item of recipeResult.rows) {
        const qtyRequired = parseFloat(item.quantity_required) || 0;
        const wastagePct = parseFloat(item.wastage_percentage) || 0;
        const cookingLossPct = parseFloat(item.cooking_loss_percentage) || 0;
        const unitCost = parseFloat(item.unit_cost) || 0;
        
        const effectiveQty = qtyRequired * quantity * (1 + wastagePct / 100) * (1 + cookingLossPct / 100);
        totalCost += effectiveQty * unitCost;
    }
    return totalCost;
};

// ============================================
// DEDUCT INGREDIENTS - WITH FORENSIC LOGGING
// ============================================
const deductIngredients = async (productId, quantity, client) => {
    const traceId = `INV001-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    
    console.log(`\n[${traceId}] === INV-001 DEDUCT INGREDIENTS ===`);
    console.log(`[${traceId}] RAW quantity received:`, quantity);
    console.log(`[${traceId}] quantity type:`, typeof quantity);
    console.log(`[${traceId}] productId:`, productId);

    const saleQuantity = Number(quantity);
    console.log(`[${traceId}] Normalized saleQuantity:`, saleQuantity);

    if (!Number.isFinite(saleQuantity) || saleQuantity <= 0) {
        console.error(`[${traceId}] INVALID QUANTITY:`, { quantity, saleQuantity });
        throw new AppError('Invalid sale quantity', 400);
    }

    const recipeResult = await client.query(
        `SELECT ri.ingredient_id, ri.quantity_required, i.quantity as current_stock, i.name,
                ri.wastage_percentage, ri.cooking_loss_percentage
         FROM recipe_ingredients ri
         JOIN ingredients i ON ri.ingredient_id = i.id
         WHERE ri.recipe_id IN (SELECT id FROM recipes WHERE product_id = $1)`,
        [productId]
    );

    console.log(`[${traceId}] RECIPE ROWS FOUND:`, recipeResult.rows.length);

    let executionCount = 0;

    for (const item of recipeResult.rows) {
        executionCount++;
        
        const qtyRequired = parseFloat(item.quantity_required) || 0;
        const wastagePct = parseFloat(item.wastage_percentage) || 0;
        const cookingLossPct = parseFloat(item.cooking_loss_percentage) || 0;
        const currentQuantity = parseFloat(item.current_stock) || 0;

        console.log(`[${traceId}] INGREDIENT ${executionCount}:`, {
            name: item.name,
            ingredientId: item.ingredient_id,
            qtyRequired,
            saleQuantity,
            wastagePct,
            cookingLossPct,
            currentQuantity
        });

        const requiredAmount = qtyRequired * saleQuantity * (1 + wastagePct / 100) * (1 + cookingLossPct / 100);
        const newQuantity = currentQuantity - requiredAmount;

        console.log(`[${traceId}] STOCK UPDATE ${executionCount}:`, {
            name: item.name,
            currentQuantity,
            requiredAmount,
            newQuantity
        });

        await client.query(
            'UPDATE ingredients SET quantity = quantity - $1 WHERE id = $2',
            [requiredAmount, item.ingredient_id]
        );
    }

    console.log(`[${traceId}] TOTAL DEDUCTION EXECUTIONS: ${executionCount}`);
    console.log(`[${traceId}] === END DEDUCT INGREDIENTS ===\n`);
};

// ============================================
// GET ALL SALES
// ============================================
export const getSales = catchAsync(async (req, res) => {
    const { startDate, endDate, page = 1, limit = 20 } = req.query;
    
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let sql = `
        SELECT s.*, u.name as cashier_name,
               COUNT(si.id) as item_count
        FROM sales s
        LEFT JOIN users u ON s.user_id = u.id
        LEFT JOIN sale_items si ON s.id = si.sale_id
        WHERE s.status = 'completed'
          AND s.company_id = $1
          AND s.branch_id = $2
    `;
    const params = [companyId, branchId];
    let paramIndex = 3;
    
    if (startDate) {
        sql += ` AND DATE(s.created_at) >= $${paramIndex++}`;
        params.push(startDate);
    }
    if (endDate) {
        sql += ` AND DATE(s.created_at) <= $${paramIndex++}`;
        params.push(endDate);
    }
    
    sql += ` GROUP BY s.id, u.name ORDER BY s.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), offset);
    
    const result = await query(sql, params);
    
    const countResult = await query(
        'SELECT COUNT(*) FROM sales WHERE status = $1 AND company_id = $2 AND branch_id = $3',
        ['completed', companyId, branchId]
    );
    
    res.json({
        success: true,
        data: result.rows,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: parseInt(countResult.rows[0].count),
            pages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
        }
    });
});

// ============================================
// GET SALE BY ID
// ============================================
export const getSaleById = catchAsync(async (req, res) => {
    const { id } = req.params;
    
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    const saleResult = await query(
        `SELECT s.*, u.name as cashier_name
         FROM sales s
         LEFT JOIN users u ON s.user_id = u.id
         WHERE s.id = $1 AND s.company_id = $2 AND s.branch_id = $3`,
        [id, companyId, branchId]
    );
    
    if (saleResult.rows.length === 0) {
        throw new AppError('Sale not found', 404);
    }
    
    const itemsResult = await query(
        `SELECT si.*, p.name as product_name, p.category
         FROM sale_items si
         JOIN products p ON si.product_id = p.id
         WHERE si.sale_id = $1`,
        [id]
    );
    
    res.json({
        success: true,
        data: {
            ...saleResult.rows[0],
            items: itemsResult.rows
        }
    });
});

// ============================================
// CREATE SALE
// ============================================
export const createSale = catchAsync(async (req, res) => {
    const traceId = `INV001-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    
    console.log(`\n[${traceId}] === INV-001 CREATE SALE ===`);
    console.log(`[${traceId}] RAW BODY:`, JSON.stringify(req.body));
    
    const { items, payment_method, customer_name, customer_phone } = req.body;
    const userId = req.user.id;
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    if (!companyId || !branchId) {
        throw new AppError('Company and branch context required', 401);
    }
    
    if (!items || items.length === 0) {
        throw new AppError('No items in sale', 400);
    }
    
    console.log(`[${traceId}] ITEMS:`, JSON.stringify(items));
    console.log(`[${traceId}] items.length:`, items.length);
    
    const client = await getClient();
    
    try {
        await client.query('BEGIN');
        
        let totalAmount = 0;
        let totalCost = 0;
        const saleItems = [];
        
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const quantity = Number(item.quantity);
            
            console.log(`[${traceId}] SALE ITEM ${i}:`, {
                product_id: item.product_id,
                quantity: quantity,
                quantityType: typeof quantity,
                rawQuantity: item.quantity
            });
            
            if (!Number.isFinite(quantity) || quantity <= 0) {
                throw new AppError(`Invalid quantity for product ${item.product_id}`, 400);
            }
            
            const productResult = await client.query(
                `SELECT id, name, price FROM products 
                 WHERE id = $1 AND company_id = $2 AND is_available = true`,
                [item.product_id, companyId]
            );
            
            if (productResult.rows.length === 0) {
                throw new Error(`Product ${item.product_id} not found`);
            }
            
            const product = productResult.rows[0];
            const unitPrice = parseFloat(product.price);
            const itemTotal = unitPrice * quantity;
            const itemCost = await calculateProductCost(item.product_id, quantity, client);
            
            totalAmount += itemTotal;
            totalCost += itemCost;
            
            saleItems.push({
                product_id: item.product_id,
                product_name: product.name,
                quantity,
                unit_price: unitPrice,
                total_price: itemTotal,
                cost: itemCost
            });
            
            console.log(`[${traceId}] BEFORE deductIngredients:`, {
                productId: item.product_id,
                quantity: quantity
            });
            
            await deductIngredients(item.product_id, quantity, client);
        }
        
        const profit = totalAmount - totalCost;
        const profitMargin = totalAmount > 0 ? (profit / totalAmount) * 100 : 0;
        const saleNumber = generateSaleNumber();
        
        const saleResult = await client.query(
            `INSERT INTO sales (company_id, branch_id, user_id, sale_number, total_amount, total_cost, profit, payment_method, customer_name, customer_phone, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'completed')
             RETURNING id, sale_number, created_at`,
            [companyId, branchId, userId, saleNumber, totalAmount, totalCost, profit, payment_method, customer_name, customer_phone]
        );
        
        const saleId = saleResult.rows[0].id;
        
        for (const item of saleItems) {
            await client.query(
                `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price)
                 VALUES ($1, $2, $3, $4, $5)`,
                [saleId, item.product_id, item.quantity, item.unit_price, item.total_price]
            );
        }
        
        await client.query('COMMIT');
        
        console.log(`[${traceId}] === SALE COMPLETED ===`);
        console.log(`[${traceId}] Sale Number: ${saleNumber}`);
        console.log(`[${traceId}] Total Amount: ${totalAmount}`);
        console.log(`[${traceId}] Total Cost: ${totalCost}`);
        console.log(`[${traceId}] Profit: ${profit}`);
        console.log(`[${traceId}] Profit Margin: ${profitMargin}%\n`);
        
        res.status(201).json({
            success: true,
            message: 'Sale completed successfully',
            data: {
                sale_id: saleId,
                sale_number: saleNumber,
                total_amount: totalAmount,
                total_cost: totalCost,
                profit: profit,
                profit_margin: profitMargin.toFixed(2),
                payment_method: payment_method,
                items: saleItems
            }
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`[${traceId}] Create sale error:`, error);
        throw error;
    } finally {
        client.release();
    }
});

// ============================================
// GET TODAY'S SALES
// ============================================
export const getTodaySales = catchAsync(async (req, res) => {
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    const today = new Date().toISOString().split('T')[0];
    
    const result = await query(
        `SELECT 
           COUNT(*) as total_orders,
           COALESCE(SUM(total_amount), 0) as total_revenue,
           COALESCE(SUM(profit), 0) as total_profit,
           COALESCE(AVG(total_amount), 0) as average_order,
           CASE 
               WHEN SUM(total_amount) > 0 
               THEN ROUND((SUM(profit) / SUM(total_amount)) * 100, 2)
               ELSE 0 
           END as profit_margin
         FROM sales
         WHERE DATE(created_at) = $1 
           AND status = 'completed'
           AND company_id = $2
           AND branch_id = $3`,
        [today, companyId, branchId]
    );
    
    res.json({
        success: true,
        data: result.rows[0],
        date: today
    });
});