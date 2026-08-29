// server/src/controllers/dashboardController.js

import { query } from '../config/database.js';
import { catchAsync, AppError } from '../middleware/errorHandler.js';

// ============================================
// GET DASHBOARD DATA
// ============================================
export const getDashboardData = catchAsync(async (req, res) => {
    if (!req.user?.company_id || !req.user?.branch_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Today's stats - fixed: use orders table not sales
    const todayStats = await query(`
        SELECT 
            COUNT(*) as total_orders,
            COALESCE(SUM(total_amount), 0) as total_revenue,
            COALESCE(AVG(total_amount), 0) as average_order
        FROM orders
        WHERE DATE(created_at) = $1 
          AND status = 'completed'
          AND company_id = $2
          AND branch_id = $3
    `, [today, companyId, branchId]);

    // Week stats
    const weekStats = await query(`
        SELECT 
            COUNT(*) as total_orders,
            COALESCE(SUM(total_amount), 0) as total_revenue
        FROM orders
        WHERE DATE(created_at) >= $1 
          AND status = 'completed'
          AND company_id = $2
          AND branch_id = $3
    `, [weekAgo, companyId, branchId]);

    // Month stats
    const monthStats = await query(`
        SELECT 
            COUNT(*) as total_orders,
            COALESCE(SUM(total_amount), 0) as total_revenue
        FROM orders
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

    // Top 5 products from order_items
    const topProducts = await query(`
        SELECT 
            p.id,
            p.name,
            COALESCE(SUM(oi.quantity), 0) as quantity_sold,
            COALESCE(SUM(oi.total_price), 0) as revenue
        FROM products p
        LEFT JOIN order_items oi ON p.id = oi.product_id
        LEFT JOIN orders o ON oi.order_id = o.id 
          AND o.status = 'completed'
          AND o.company_id = $1
          AND o.branch_id = $2
        WHERE p.company_id = $1
        GROUP BY p.id, p.name
        ORDER BY revenue DESC
        LIMIT 5
    `, [companyId, branchId]);

    // Recent orders
    const recentOrders = await query(`
        SELECT o.id, o.order_number, o.total_amount, o.created_at, u.name as cashier_name
        FROM orders o
        LEFT JOIN users u ON o.created_by = u.id
        WHERE o.status = 'completed'
          AND o.company_id = $1
          AND o.branch_id = $2
        ORDER BY o.created_at DESC
        LIMIT 10
    `, [companyId, branchId]);

    const monthRevenue = parseFloat(monthStats.rows[0].total_revenue || 0);
    const monthExpensesTotal = parseFloat(monthExpenses.rows[0].total_expenses || 0);
    const monthProfit = monthRevenue - monthExpensesTotal;

    res.json({
        success: true,
        data: {
            today: {
                orders: parseInt(todayStats.rows[0].total_orders || 0),
                revenue: parseFloat(todayStats.rows[0].total_revenue || 0),
                average_order: parseFloat(todayStats.rows[0].average_order || 0)
            },
            week: {
                orders: parseInt(weekStats.rows[0].total_orders || 0),
                revenue: parseFloat(weekStats.rows[0].total_revenue || 0)
            },
            month: {
                orders: parseInt(monthStats.rows[0].total_orders || 0),
                revenue: monthRevenue,
                expenses: monthExpensesTotal,
                profit: monthProfit,
                net_profit: monthProfit,
                profit_margin: monthRevenue > 0 ? (monthProfit / monthRevenue) * 100 : 0
            },
            inventory: {
                low_stock: parseInt(lowStock.rows[0].count || 0)
            },
            users: totalStaff.rows,
            top_products: topProducts.rows,
            recent_sales: recentOrders.rows
        }
    });
});

// ============================================
// GET CHART DATA
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

    // Sales data from orders
    const salesData = await query(`
        SELECT 
            DATE(created_at) as date,
            COALESCE(SUM(total_amount), 0) as revenue,
            COUNT(*) as orders
        FROM orders
        WHERE created_at >= NOW() - INTERVAL '${days} days'
          AND status = 'completed'
          AND company_id = $1
          AND branch_id = $2
        GROUP BY DATE(created_at)
        ORDER BY date ASC
    `, [companyId, branchId]);

    // Top products
    const topProducts = await query(`
        SELECT 
            p.name,
            COALESCE(SUM(oi.quantity), 0) as total_sold,
            COALESCE(SUM(oi.total_price), 0) as revenue
        FROM products p
        LEFT JOIN order_items oi ON p.id = oi.product_id
        LEFT JOIN orders o ON oi.order_id = o.id 
          AND o.status = 'completed' 
          AND o.company_id = $1
          AND o.branch_id = $2
          AND o.created_at >= NOW() - INTERVAL '30 days'
        WHERE p.company_id = $1
        GROUP BY p.id, p.name
        ORDER BY revenue DESC
        LIMIT 5
    `, [companyId, branchId]);

    // Payment methods from orders
    const paymentMethods = await query(`
        SELECT 
            COALESCE(payment_method, 'cash') as payment_method,
            COUNT(*) as count,
            COALESCE(SUM(total_amount), 0) as total
        FROM orders
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND status = 'completed'
          AND company_id = $1
          AND branch_id = $2
        GROUP BY payment_method
    `, [companyId, branchId]);

    // Hourly data from orders
    const hourlyData = await query(`
        SELECT 
            EXTRACT(HOUR FROM created_at) as hour,
            COUNT(*) as orders,
            COALESCE(SUM(total_amount), 0) as revenue
        FROM orders
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