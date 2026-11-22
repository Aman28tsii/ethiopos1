// server/src/controllers/saleController.js
import { query, getClient } from '../config/database.js';
import { AppError, catchAsync } from '../middleware/errorHandler.js';
import { cacheSet as memoryCacheSet } from '../middleware/idempotency.js';

// ============================================
// HELPER: GENERATE SALE NUMBER
// ============================================
const generateSaleNumber = () => {
  const date = new Date();
  const timestamp = date.getTime().toString().slice(-8);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `SALE-${timestamp}${random}`;
};

// ============================================
// HELPER: CALCULATE PRODUCT COST
// ============================================
// ✅ D6 FIX: Now includes yield_quantity in calculation
const calculateProductCost = async (productId, quantity, client) => {
  const recipeResult = await client.query(
    `SELECT ri.quantity_required, i.unit_cost, ri.wastage_percentage, ri.cooking_loss_percentage, r.yield_quantity
     FROM recipe_ingredients ri
     JOIN ingredients i ON ri.ingredient_id = i.id
     JOIN recipes r ON ri.recipe_id = r.id
     WHERE r.product_id = $1`,
    [productId]
  );
  
  let totalCost = 0;
  for (const item of recipeResult.rows) {
    const qtyRequired = parseFloat(item.quantity_required) || 0;
    const yieldQty = parseFloat(item.yield_quantity) || 1; // ✅ D6: get yield
    const wastagePct = parseFloat(item.wastage_percentage) || 0;
    const cookingLossPct = parseFloat(item.cooking_loss_percentage) || 0;
    const unitCost = parseFloat(item.unit_cost) || 0;
    
    // ✅ D6 FIX: Divide by yield_quantity to get per-portion cost
    const effectiveQty = (qtyRequired / yieldQty) * quantity * (1 + wastagePct / 100) * (1 + cookingLossPct / 100);
    totalCost += effectiveQty * unitCost;
  }
  return totalCost;
};

// ============================================
// HELPER: DEDUCT INGREDIENTS (D4 Fixed)
// ============================================
const deductIngredients = async (productId, quantity, saleId, companyId, branchId, client) => {
  const saleQuantity = Number(quantity);
  if (!Number.isFinite(saleQuantity) || saleQuantity <= 0) {
    throw new AppError('Invalid sale quantity', 400);
  }
  
  // ✅ D6 FIX: Include yield_quantity in query
  const recipeResult = await client.query(
    `SELECT ri.ingredient_id, ri.quantity_required, i.name,
     ri.wastage_percentage, ri.cooking_loss_percentage, i.unit_cost, i.company_id, i.branch_id,
     r.yield_quantity
     FROM recipe_ingredients ri
     JOIN ingredients i ON ri.ingredient_id = i.id
     JOIN recipes r ON ri.recipe_id = r.id
     WHERE r.product_id = $1`,
    [productId]
  );
  
  if (recipeResult.rows.length === 0) {
    return; // No ingredients to deduct
  }
  
  // ✅ D6 FIX: Get yield_quantity
  const yieldQty = recipeResult.rows[0]?.yield_quantity || 1;
  
  const ingredientMap = new Map();
  const ingredientIds = [];
  
  for (const item of recipeResult.rows) {
    const qtyRequired = parseFloat(item.quantity_required) || 0;
    const wastagePct = parseFloat(item.wastage_percentage) || 0;
    const cookingLossPct = parseFloat(item.cooking_loss_percentage) || 0;
    
    // ✅ D6 FIX: Divide by yield_quantity to get per-portion amount
    const expectedQuantity = (qtyRequired / yieldQty) * saleQuantity;
    const requiredAmount = expectedQuantity * (1 + wastagePct / 100) * (1 + cookingLossPct / 100);
    const finalQuantity = (item.unit === 'pcs' || item.unit === 'pieces') 
      ? Math.ceil(requiredAmount) 
      : Math.ceil(requiredAmount * 100) / 100;
    
    const wastageAmount = finalQuantity - expectedQuantity;
    const wastagePercentage = expectedQuantity > 0 ? (wastageAmount / expectedQuantity * 100) : 0;
    
    if (!ingredientMap.has(item.ingredient_id)) {
      ingredientMap.set(item.ingredient_id, {
        ingredient_id: item.ingredient_id,
        name: item.name,
        unit_cost: item.unit_cost,
        unit: item.unit,
        total_required: finalQuantity,
        expected_quantity: expectedQuantity,
        wastage_amount: wastageAmount,
        wastage_percentage: wastagePercentage,
        company_id: item.company_id,
        branch_id: item.branch_id
      });
      ingredientIds.push(item.ingredient_id);
    } else {
      const existing = ingredientMap.get(item.ingredient_id);
      existing.total_required += finalQuantity;
      existing.expected_quantity += expectedQuantity;
      existing.wastage_amount += wastageAmount;
    }
  }
  
  // Sort ingredient IDs to prevent deadlocks
  ingredientIds.sort((a, b) => a - b);
  
  // Lock all ingredient rows in deterministic order with tenant isolation
  const lockQuery = `
    SELECT id, quantity, name, unit, company_id, branch_id
    FROM ingredients
    WHERE id = ANY($1) AND company_id = $2 AND branch_id = $3
    FOR UPDATE
  `;
  const lockedResult = await client.query(lockQuery, [ingredientIds, companyId, branchId]);
  
  if (lockedResult.rows.length !== ingredientIds.length) {
    const foundIds = lockedResult.rows.map(r => r.id);
    const missingIds = ingredientIds.filter(id => !foundIds.includes(id));
    throw new AppError(`Some ingredients not found or tenant mismatch: ${missingIds.join(', ')}`, 404);
  }
  
  // Verify sufficient stock for ALL ingredients
  for (const row of lockedResult.rows) {
    const required = ingredientMap.get(row.id).total_required;
    const available = parseFloat(row.quantity);
    if (available < required) {
      throw new AppError(
        `INSUFFICIENT_STOCK: ${row.name}. Available: ${available}, Required: ${required}`,
        400,
        'INSUFFICIENT_STOCK'
      );
    }
  }
  
  // Atomic stock update with guarded update
  for (const row of lockedResult.rows) {
    const required = ingredientMap.get(row.id).total_required;
    const updateResult = await client.query(`
      UPDATE ingredients 
      SET quantity = quantity - $1, updated_at = NOW()
      WHERE id = $2 AND company_id = $3 AND branch_id = $4 AND quantity >= $1
      RETURNING id, name, quantity, unit
    `, [required, row.id, companyId, branchId]);
    
    if (updateResult.rows.length === 0) {
      throw new AppError(`STOCK_CONFLICT: ${row.name}. Stock was insufficient during update.`, 409, 'STOCK_CONFLICT');
    }
  }
  
  // Create stock transaction records
  for (const row of lockedResult.rows) {
    const required = ingredientMap.get(row.id).total_required;
    const expected = ingredientMap.get(row.id).expected_quantity;
    const wastage = ingredientMap.get(row.id).wastage_amount;
    const wastagePct = ingredientMap.get(row.id).wastage_percentage;
    
    await client.query(`
      INSERT INTO stock_transactions (
        ingredient_id, order_id, product_id, sale_id,
        expected_quantity, actual_quantity,
        wastage_amount, wastage_percentage,
        transaction_type, notes,
        company_id, branch_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      row.id,
      null, // order_id
      productId,
      saleId,
      parseFloat(expected.toFixed(3)),
      parseFloat(required.toFixed(3)),
      parseFloat(wastage.toFixed(3)),
      parseFloat(wastagePct.toFixed(1)),
      'sale_deduction',
      `Sale ${saleId} - ${row.name}`,
      companyId,
      branchId
    ]);
  }
};

// ============================================================
// CREATE SALE (Direct sale — Cashier)
// ============================================================
export const createSale = catchAsync(async (req, res) => {
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
  
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    
    let totalAmount = 0;
    let totalCost = 0;
    const saleItems = [];
    
    for (const item of items) {
      const quantity = Number(item.quantity);
      
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
    }
    
    const saleNumber = generateSaleNumber();
    const profit = totalAmount - totalCost;
    const profitMargin = totalAmount > 0 ? (profit / totalAmount) * 100 : 0;
    
    const saleResult = await client.query(
      `INSERT INTO sales (company_id, branch_id, user_id, sale_number, total_amount, total_cost, profit, payment_method, customer_name, customer_phone, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'completed')
       RETURNING id, sale_number, created_at`,
      [companyId, branchId, userId, saleNumber, totalAmount, totalCost, profit, payment_method, customer_name || null, customer_phone || null]
    );
    
    const saleId = saleResult.rows[0].id;
    
    for (const item of items) {
      await deductIngredients(item.product_id, item.quantity, saleId, companyId, branchId, client);
    }
    
    for (const item of saleItems) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price, total_cost, profit)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [saleId, item.product_id, item.quantity, item.unit_price, item.total_price, item.cost, item.total_price - item.cost]
      );
    }
    
    // D3 fix: write the idempotency record inside the business transaction
    if (req.idempotencyContext) {
      const ctx = req.idempotencyContext;
      const idemResponseBody = {
        success: true,
        message: 'Sale completed successfully',
        data: {
          sale_id: saleId,
          sale_number: saleNumber,
          total_amount: totalAmount,
          total_cost: totalCost,
          profit: profit,
          profit_margin: parseFloat(profitMargin.toFixed(2)),
          payment_method: payment_method,
          items: saleItems
        }
      };
      try {
        await client.query(
          `INSERT INTO idempotency_records (
            idempotency_key, company_id, branch_id, resource_type,
            resource_id, request_hash, response_data, status_code,
            status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'completed', NOW(), NOW())`,
          [
            ctx.key, ctx.companyId, ctx.branchId, ctx.resourceType,
            String(saleId), ctx.requestHash, JSON.stringify(idemResponseBody), 201
          ]
        );
      } catch (idemErr) {
        if (idemErr.code === '23505') {
          await client.query('ROLLBACK');
          const existing = await query(
            `SELECT response_data, status_code, request_hash FROM idempotency_records
             WHERE idempotency_key = $1 AND company_id = $2 AND branch_id = $3 AND resource_type = $4`,
            [ctx.key, ctx.companyId, ctx.branchId, ctx.resourceType]
          );
          if (existing.rows.length > 0) {
            const record = existing.rows[0];
            memoryCacheSet(ctx.cacheKey, record.status_code, record.response_data, record.request_hash);
            return res.status(record.status_code || 201).json(record.response_data);
          }
          return res.status(409).json({ success: false, error: 'Duplicate request' });
        }
        throw idemErr;
      }
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      message: 'Sale completed successfully',
      data: {
        sale_id: saleId,
        sale_number: saleNumber,
        total_amount: totalAmount,
        total_cost: totalCost,
        profit: profit,
        profit_margin: parseFloat(profitMargin.toFixed(2)),
        payment_method: payment_method,
        items: saleItems
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create sale error:', error);
    throw error;
  } finally {
    client.release();
  }
});

// ============================================================
// GET ALL SALES
// ============================================================
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
           COUNT(si.id) as item_count,
           COALESCE(SUM(si.total_price), 0) as items_total
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

// ============================================================
// GET SALE BY ID
// ============================================================
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

// ============================================================
// GET TODAY'S SALES
// ============================================================
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
       COALESCE(SUM(total_cost), 0) as total_cost,
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