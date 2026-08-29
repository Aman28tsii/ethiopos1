// server/src/controllers/profitController.js

import { query } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';

// ============================================================
// GET PROFIT REPORT (Branch-isolated)
// ============================================================
export const getProfitReport = catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query;
    
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
  
    if (!startDate || !endDate) {
        throw new AppError('startDate and endDate are required', 400);
    }
  
    const summaryResult = await query(`
        SELECT 
            COUNT(*) as total_sales,
            ROUND(COALESCE(SUM(total_amount), 0)) as total_revenue,
            COALESCE(SUM(total_cost), 0) as total_cost,
            COALESCE(SUM(profit), 0) as total_profit,
            AVG(total_amount) as average_order_value,
            AVG(profit) as average_profit_per_order,
            CASE 
                WHEN SUM(total_amount) > 0 
                THEN ROUND((SUM(profit) / SUM(total_amount)) * 100, 2)
                ELSE 0 
            END as profit_margin
        FROM sales
        WHERE DATE(created_at) BETWEEN $1 AND $2
          AND status = 'completed'
          AND company_id = $3
          AND branch_id = $4
    `, [startDate, endDate, companyId, branchId]);
  
    const dailyResult = await query(`
        SELECT 
            DATE(created_at) as date,
            COUNT(*) as sales_count,
            COALESCE(SUM(total_amount), 0) as revenue,
            COALESCE(SUM(total_cost), 0) as cost,
            COALESCE(SUM(profit), 0) as profit,
            CASE 
                WHEN SUM(total_amount) > 0 
                THEN ROUND((SUM(profit) / SUM(total_amount)) * 100, 2)
                ELSE 0 
            END as profit_margin
        FROM sales
        WHERE DATE(created_at) BETWEEN $1 AND $2
          AND status = 'completed'
          AND company_id = $3
          AND branch_id = $4
        GROUP BY DATE(created_at)
        ORDER BY date DESC
    `, [startDate, endDate, companyId, branchId]);
  
    const topProductsResult = await query(`
        SELECT 
            p.id,
            p.name,
            p.category,
            COALESCE(SUM(si.quantity), 0) as quantity_sold,
            COALESCE(SUM(si.total_price), 0) as revenue,
            0 as cost,
            COALESCE(SUM(si.total_price), 0) as profit,
            100 as profit_margin
        FROM products p
        LEFT JOIN sale_items si ON p.id = si.product_id
        LEFT JOIN sales s ON si.sale_id = s.id 
          AND s.status = 'completed' 
          AND DATE(s.created_at) BETWEEN $1 AND $2
          AND s.company_id = $3
          AND s.branch_id = $4
        WHERE p.company_id = $3
        GROUP BY p.id, p.name, p.category
        ORDER BY profit DESC
        LIMIT 10
    `, [startDate, endDate, companyId, branchId]);
  
    const paymentMethodResult = await query(`
        SELECT 
            COALESCE(payment_method, 'cash') as payment_method,
            COUNT(*) as transaction_count,
            COALESCE(SUM(total_amount), 0) as revenue,
            COALESCE(SUM(profit), 0) as profit,
            CASE 
                WHEN SUM(total_amount) > 0 
                THEN ROUND((SUM(profit) / SUM(total_amount)) * 100, 2)
                ELSE 0 
            END as profit_margin
        FROM sales
        WHERE DATE(created_at) BETWEEN $1 AND $2
          AND status = 'completed'
          AND company_id = $3
          AND branch_id = $4
        GROUP BY payment_method
        ORDER BY profit DESC
    `, [startDate, endDate, companyId, branchId]);
  
    res.json({
        success: true,
        data: {
            period: { startDate, endDate },
            summary: summaryResult.rows[0] || {
                total_sales: 0,
                total_revenue: 0,
                total_cost: 0,
                total_profit: 0,
                average_order_value: 0,
                average_profit_per_order: 0,
                profit_margin: 0
            },
            daily_breakdown: dailyResult.rows,
            top_products: topProductsResult.rows,
            by_payment_method: paymentMethodResult.rows
        }
    });
});

// ============================================================
// GET TODAY'S PROFIT (Branch-isolated)
// ============================================================
export const getTodayProfit = catchAsync(async (req, res) => {
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    const today = new Date().toISOString().split('T')[0];
  
    const result = await query(`
        SELECT 
            COUNT(*) as orders,
            COALESCE(SUM(total_amount), 0) as revenue,
            COALESCE(SUM(total_cost), 0) as cost,
            COALESCE(SUM(profit), 0) as profit,
            CASE 
                WHEN SUM(total_amount) > 0 
                THEN ROUND((SUM(profit) / SUM(total_amount)) * 100, 2)
                ELSE 0 
            END as profit_margin,
            AVG(total_amount) as average_order
        FROM sales
        WHERE DATE(created_at) = $1
          AND status = 'completed'
          AND company_id = $2
          AND branch_id = $3
    `, [today, companyId, branchId]);
  
    const hourlyResult = await query(`
        SELECT 
            EXTRACT(HOUR FROM created_at) as hour,
            COUNT(*) as orders,
            COALESCE(SUM(total_amount), 0) as revenue,
            COALESCE(SUM(profit), 0) as profit
        FROM sales
        WHERE DATE(created_at) = $1
          AND status = 'completed'
          AND company_id = $2
          AND branch_id = $3
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour ASC
    `, [today, companyId, branchId]);
  
    res.json({
        success: true,
        data: {
            date: today,
            summary: result.rows[0] || {
                orders: 0,
                revenue: 0,
                cost: 0,
                profit: 0,
                profit_margin: 0,
                average_order: 0
            },
            hourly: hourlyResult.rows
        }
    });
});

// ============================================================
// GET MONTHLY TREND (Branch-isolated)
// ============================================================
export const getMonthlyTrend = catchAsync(async (req, res) => {
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    const { months = 6 } = req.query;
  
    const result = await query(`
        SELECT 
            DATE_TRUNC('month', created_at) as month,
            COUNT(*) as orders,
            COALESCE(SUM(total_amount), 0) as revenue,
            COALESCE(SUM(total_cost), 0) as cost,
            COALESCE(SUM(profit), 0) as profit,
            CASE 
                WHEN SUM(total_amount) > 0 
                THEN ROUND((SUM(profit) / SUM(total_amount)) * 100, 2)
                ELSE 0 
            END as profit_margin
        FROM sales
        WHERE created_at >= NOW() - INTERVAL '${months} months'
          AND status = 'completed'
          AND company_id = $1
          AND branch_id = $2
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month ASC
    `, [companyId, branchId]);
  
    res.json({
        success: true,
        data: result.rows
    });
});