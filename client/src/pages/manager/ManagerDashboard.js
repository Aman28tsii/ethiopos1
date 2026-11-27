import React, { useState, useEffect } from 'react';
import API from '../../api/axios';
import { Loader2, DollarSign, Package, Users, TrendingUp, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { formatCurrency } from '../../utils/formatting';

const ManagerDashboard = () => {
  const { t } = useLanguage();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const [todaySales, lowStock, products] = await Promise.all([
        API.get('/sales/today'),
        API.get('/ingredients/low-stock'),
        API.get('/products')
      ]);
      
      setStats({
        todaySales: todaySales.data.data,
        lowStock: lowStock.data.data || [],
        totalProducts: products.data.data?.length || 0
      });
    } catch (err) {
      console.error('Fetch stats error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-blue-500" size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('managerDashboard')}</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{t('operationalOverview')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign size={20} className="text-green-400" />
            <p className="text-gray-500 dark:text-gray-400">{t('todaySales')}</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(stats?.todaySales?.total_revenue)}</p>
          <p className="text-sm text-gray-500 mt-1">{stats?.todaySales?.total_orders || 0} {t('orders')}</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-2">
            <Package size={20} className="text-blue-400" />
            <p className="text-gray-500 dark:text-gray-400">{t('totalProducts')}</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.totalProducts || 0}</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-2">
            <Users size={20} className="text-purple-400" />
            <p className="text-gray-500 dark:text-gray-400">{t('staffOnDuty')}</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">-</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp size={20} className="text-yellow-400" />
            <p className="text-gray-500 dark:text-gray-400">{t('avgOrderValue')}</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(stats?.todaySales?.average_order)}</p>
        </div>
      </div>

      {stats?.lowStock?.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-yellow-400" />
            <div>
              <p className="text-yellow-400 font-semibold">{t('lowStockAlert')}</p>
              <p className="text-gray-500 dark:text-gray-400 text-sm">{stats.lowStock.length} {t('ingredientsNeedReorder')}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button className="bg-white dark:bg-gray-800 hover:bg-gray-100 dark:bg-gray-700 rounded-xl p-6 text-left transition border border-gray-200 dark:border-gray-700">
          <Package size={24} className="text-blue-400 mb-3" />
          <h3 className="text-gray-900 dark:text-white font-semibold">{t('updateInventory')}</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{t('addOrEditStockLevels')}</p>
        </button>
        <button className="bg-white dark:bg-gray-800 hover:bg-gray-100 dark:bg-gray-700 rounded-xl p-6 text-left transition border border-gray-200 dark:border-gray-700">
          <TrendingUp size={24} className="text-green-400 mb-3" />
          <h3 className="text-gray-900 dark:text-white font-semibold">{t('viewReports')}</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{t('salesAndProfitAnalytics')}</p>
        </button>
      </div>
    </div>
  );
};

export default ManagerDashboard;
