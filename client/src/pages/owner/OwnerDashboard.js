// client/src/pages/owner/OwnerDashboard.js

import React, { useState, useEffect } from 'react';
import API from '../../api/axios';
import { Loader2, DollarSign, TrendingUp, Users, Calendar } from 'lucide-react';
import { RevenueChart, TopProductsChart, PaymentMethodsChart, HourlySalesChart } from '../../components/Charts';
import LowStockAlert from '../../components/LowStockAlert';
import StaffPerformance from '../../components/StaffPerformance';
import { useLanguage } from '../../context/LanguageContext';
import { useBranch } from '../../context/BranchContext';
import { formatCurrency } from '../../utils/formatting';

const OwnerDashboard = () => {
  const { t } = useLanguage();
  const { selectedBranch } = useBranch();
  const [data, setData] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');

  const fetchData = async () => {
    setLoading(true);
    try {
      // Use selected branch for API calls
      const branchId = selectedBranch?.id;
      const params = { period };
      if (branchId) {
        params.branchId = branchId;
      }
      
      const [dashboardRes, chartsRes] = await Promise.all([
        API.get('/dashboard', { params }),
        API.get('/dashboard/charts', { params })
      ]);
      setData(dashboardRes.data.data);
      setChartData(chartsRes.data.data);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [period, selectedBranch]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-blue-500" size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Branch indicator */}
      {selectedBranch && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-2 flex items-center gap-2 text-blue-700 dark:text-blue-400 text-sm">
          <span className="font-semibold">📍 Viewing:</span>
          <span>{selectedBranch.name}</span>
        </div>
      )}

      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('ownerDashboard')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('fullBusinessAnalytics')}</p>
        </div>
        
        <div className="flex gap-2 bg-white dark:bg-gray-800 rounded-xl p-1 border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setPeriod('week')}
            className={"px-4 py-2 rounded-lg font-semibold transition " + (period === 'week' ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white')}
          >
            {t('last7Days')}
          </button>
          <button
            onClick={() => setPeriod('month')}
            className={"px-4 py-2 rounded-lg font-semibold transition " + (period === 'month' ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white')}
          >
            {t('last30Days')}
          </button>
          <button
            onClick={() => setPeriod('year')}
            className={"px-4 py-2 rounded-lg font-semibold transition " + (period === 'year' ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white')}
          >
            {t('last365Days')}
          </button>
        </div>
      </div>

      <LowStockAlert />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 text-white">
          <DollarSign size={24} className="mb-2" />
          <p className="text-blue-200 text-sm">{t('totalRevenue')}</p>
          <p className="text-2xl font-bold">{formatCurrency(data?.month?.revenue)}</p>
          <p className="text-blue-200 text-xs mt-2">{t('last30Days')}</p>
        </div>
        
        <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-xl p-6 text-white">
          <TrendingUp size={24} className="mb-2" />
          <p className="text-green-200 text-sm">{t('totalProfit')}</p>
          <p className="text-2xl font-bold">{formatCurrency(data?.month?.profit)}</p>
          <p className="text-green-200 text-xs mt-2">{t('last30Days')}</p>
        </div>
        
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-xl p-6 text-white">
          <Users size={24} className="mb-2" />
          <p className="text-purple-200 text-sm">{t('totalStaff')}</p>
          <p className="text-2xl font-bold">{data?.users?.length || 0}</p>
          <p className="text-purple-200 text-xs mt-2">{t('activeEmployees')}</p>
        </div>
        
        <div className="bg-gradient-to-r from-orange-600 to-orange-700 rounded-xl p-6 text-white">
          <Calendar size={24} className="mb-2" />
          <p className="text-orange-200 text-sm">{t('totalOrders')}</p>
          <p className="text-2xl font-bold">{data?.month?.orders || 0}</p>
          <p className="text-orange-200 text-xs mt-2">{t('last30Days')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenueChart data={chartData?.sales} title={t('revenueProfitTrend')} />
        <TopProductsChart data={chartData?.top_products} title={t('topSellingProducts')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PaymentMethodsChart data={chartData?.payment_methods} title={t('paymentMethods')} />
        <HourlySalesChart data={chartData?.hourly} title={t('hourlySalesTrend')} />
      </div>

      <StaffPerformance />

      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-gray-900 dark:text-white font-semibold mb-4">{t('quickSummary')}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm">{t('avgOrderValue')}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(data?.today?.average_order)}</p>
          </div>
          <div className="text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm">{t('profitMargin')}</p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">{((data?.month?.profit_margin) || 0).toFixed(2)}%</p>
          </div>
          <div className="text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm">{t('netProfit')}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(data?.month?.net_profit)}</p>
          </div>
          <div className="text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm">{t('expenses')}</p>
            <p className="text-xl font-bold text-red-600 dark:text-red-400">{formatCurrency(data?.month?.expenses)}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OwnerDashboard;