// server/src/controllers/dashboardController.js

import { query } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';

// ============================================
// HELPER: Get Ethiopia local date
// ============================================
const getEthiopiaDate = () => {
    // Ethiopia is UTC+3
    const now = new Date();
    const ethiopiaTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
    return ethiopiaTime.toISOString().split('T')[0];
};

const getEthiopiaDateRange = (days) => {
    const now = new Date();
    const ethiopiaTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
    const endDate = ethiopiaTime.toISOString().split('T')[0];
    const startDate = new Date(ethiopiaTime.getTime() - (days * 24 * 60 * 60 * 1000));
    return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate
    };
};

// ============================================
// GET DASHBOARD DATA - ✅ FIXED
// ============================================
export const getDashboardData = catchAsync(async (req, res) => {
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    // ✅ FIXED: Use Ethiopia local date (UTC+3)
    const today = getEthiopiaDate();
    const weekAgo = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const monthAgo = new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // ✅ FIXED: Today's stats from SALES table (not orders)
    const todayStats = await query(`
        SELECT 
            COUNT(*) as total_orders,
            COALESCE(SUM(total_amount), 0) as total_revenue,
            COALESCE(AVG(total_amount), 0) as average_order,
            COALESCE(SUM(total_cost), 0) as total_cost,
            COALESCE(SUM(profit), 0) as total_profit,
            CASE 
                WHEN SUM(total_amount) > 0 
                THEN ROUND((SUM(profit) / SUM(total_amount)) * 100, 2)
                ELSE 0 
            END as profit_margin
        FROM sales
        WHERE DATE(created_at) = $1 
          AND status = 'completed'
          AND company_id = $2
          AND branch_id = $3
    `, [today, companyId, branchId]);

    // Week stats from SALES table
    const weekStats = await query(`
        SELECT 
            COUNT(*) as total_orders,
            COALESCE(SUM(total_amount), 0) as total_revenue,
            COALESCE(SUM(total_cost), 0) as total_cost,
            COALESCE(SUM(profit), 0) as total_profit,
            CASE 
                WHEN SUM(total_amount) > 0 
                THEN ROUND((SUM(profit) / SUM(total_amount)) * 100, 2)
                ELSE 0 
            END as profit_margin
        FROM sales
        WHERE DATE(created_at) >= $1 
          AND status = 'completed'
          AND company_id = $2
          AND branch_id = $3
    `, [weekAgo, companyId, branchId]);

    // Month stats from SALES table
    const monthStats = await query(`
        SELECT 
            COUNT(*) as total_orders,
            COALESCE(SUM(total_amount), 0) as total_revenue,
            COALESCE(SUM(total_cost), 0) as total_cost,
            COALESCE(SUM(profit), 0) as total_profit,
            CASE 
                WHEN SUM(total_amount) > 0 
                THEN ROUND((SUM(profit) / SUM(total_amount)) * 100, 2)
                ELSE 0 
            END as profit_margin
        FROM sales
        WHERE DATE(created_at) >= $1 
          AND status = 'completed'
          AND company_id = $2
          AND branch_id = $3
    `, [monthAgo, companyId, branchId]);

    // Month expenses
    const monthExpenses = await query(`
        SELECT COALESCE(SUM(amount), 0) as total_expenses
        FROM expenses
        WHERE expense_date >= $1
          AND company_id = $2
          AND branch_id = $3
    `, [monthAgo, companyId, branchId]);

    // Total staff
    const totalStaff = await query(`
        SELECT COUNT(*) as count
        FROM users
        WHERE company_id = $1 AND branch_id = $2 AND status = 'active'
    `, [companyId, branchId]);

    // Low stock ingredients
    const lowStock = await query(`
        SELECT COUNT(*) as count
        FROM ingredients
        WHERE company_id = $1 AND branch_id = $2 AND quantity <= min_stock
    `, [companyId, branchId]);

    // Top 5 products from SALES
    const topProducts = await query(`
        SELECT 
            p.id,
            p.name,
            COALESCE(SUM(si.quantity), 0) as quantity_sold,
            COALESCE(SUM(si.total_price), 0) as revenue
        FROM products p
        LEFT JOIN sale_items si ON p.id = si.product_id
        LEFT JOIN sales s ON si.sale_id = s.id 
          AND s.status = 'completed'
          AND s.company_id = $1
          AND s.branch_id = $2
        WHERE p.company_id = $1
        GROUP BY p.id, p.name
        ORDER BY revenue DESC
        LIMIT 5
    `, [companyId, branchId]);

    // Recent sales
    const recentSales = await query(`
        SELECT s.id, s.sale_number, s.total_amount, s.created_at, u.name as cashier_name
        FROM sales s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.status = 'completed'
          AND s.company_id = $1
          AND s.branch_id = $2
        ORDER BY s.created_at DESC
        LIMIT 10
    `, [companyId, branchId]);

    const monthRevenue = parseFloat(monthStats.rows[0].total_revenue || 0);
    const monthCost = parseFloat(monthStats.rows[0].total_cost || 0);
    const monthProfit = parseFloat(monthStats.rows[0].total_profit || 0);
    const monthExpensesTotal = parseFloat(monthExpenses.rows[0].total_expenses || 0);
    const monthNetProfit = monthProfit - monthExpensesTotal;
    const monthProfitMargin = monthRevenue > 0 ? (monthProfit / monthRevenue) * 100 : 0;

    res.json({
        success: true,
        data: {
            today: {
                orders: parseInt(todayStats.rows[0].total_orders || 0),
                revenue: parseFloat(todayStats.rows[0].total_revenue || 0),
                cost: parseFloat(todayStats.rows[0].total_cost || 0),
                profit: parseFloat(todayStats.rows[0].total_profit || 0),
                profit_margin: parseFloat(todayStats.rows[0].profit_margin || 0),
                average_order: parseFloat(todayStats.rows[0].average_order || 0)
            },
            week: {
                orders: parseInt(weekStats.rows[0].total_orders || 0),
                revenue: parseFloat(weekStats.rows[0].total_revenue || 0),
                cost: parseFloat(weekStats.rows[0].total_cost || 0),
                profit: parseFloat(weekStats.rows[0].total_profit || 0),
                profit_margin: parseFloat(weekStats.rows[0].profit_margin || 0)
            },
            month: {
                orders: parseInt(monthStats.rows[0].total_orders || 0),
                revenue: monthRevenue,
                cost: monthCost,
                profit: monthProfit,
                profit_margin: parseFloat(monthProfitMargin.toFixed(2)),
                expenses: monthExpensesTotal,
                net_profit: monthNetProfit
            },
            inventory: {
                low_stock: parseInt(lowStock.rows[0].count || 0)
            },
            users: totalStaff.rows,
            top_products: topProducts.rows,
            recent_sales: recentSales.rows
        }
    });
});

// ============================================
// GET CHART DATA - ✅ FIXED (if needed)
// ============================================
export const getChartData = catchAsync(async (req, res) => {
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    const { period = 'week' } = req.query;
    
    let days;
    switch(period) {
        case 'week': days = 7; break;
        case 'month': days = 30; break;
        case 'year': days = 365; break;
        default: days = 7;
    }

    // ✅ FIXED: Use SALES table for chart data
    const salesData = await query(`
        SELECT 
            DATE(created_at) as date,
            COALESCE(SUM(total_amount), 0) as revenue,
            COALESCE(SUM(total_cost), 0) as cost,
            COALESCE(SUM(profit), 0) as profit,
            COUNT(*) as orders
        FROM sales
        WHERE created_at >= NOW() - INTERVAL '${days} days'
          AND status = 'completed'
          AND company_id = $1
          AND branch_id = $2
        GROUP BY DATE(created_at)
        ORDER BY date ASC
    `, [companyId, branchId]);

    const topProducts = await query(`
        SELECT 
            p.name,
            COALESCE(SUM(si.quantity), 0) as total_sold,
            COALESCE(SUM(si.total_price), 0) as revenue
        FROM products p
        LEFT JOIN sale_items si ON p.id = si.product_id
        LEFT JOIN sales s ON si.sale_id = s.id 
          AND s.status = 'completed' 
          AND s.company_id = $1
          AND s.branch_id = $2
          AND s.created_at >= NOW() - INTERVAL '30 days'
        WHERE p.company_id = $1
        GROUP BY p.id, p.name
        ORDER BY revenue DESC
        LIMIT 5
    `, [companyId, branchId]);

    const paymentMethods = await query(`
        SELECT 
            COALESCE(payment_method, 'cash') as payment_method,
            COUNT(*) as count,
            COALESCE(SUM(total_amount), 0) as total
        FROM sales
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND status = 'completed'
          AND company_id = $1
          AND branch_id = $2
        GROUP BY payment_method
    `, [companyId, branchId]);

    const hourlyData = await query(`
        SELECT 
            EXTRACT(HOUR FROM created_at) as hour,
            COUNT(*) as orders,
            COALESCE(SUM(total_amount), 0) as revenue
        FROM sales
        WHERE created_at >= NOW() - INTERVAL '7 days'
          AND status = 'completed'
          AND company_id = $1
          AND branch_id = $2
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour ASC
    `, [companyId, branchId]);

    res.json({
        success: true,
        data: {
            sales: salesData.rows,
            top_products: topProducts.rows,
            payment_methods: paymentMethods.rows,
            hourly: hourlyData.rows,
            period: period
        }
    });
});