import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Calendar, Download, Loader2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import API from '../api/axios';
import { formatCurrency } from '../utils/formatting';

const Reports = () => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState(null);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setDate(1)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchReport();
  }, [dateRange]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const response = await API.get('/profit/report', { params: dateRange });
      setReportData(response.data.data);
    } catch (err) {
      console.error('Fetch report error:', err);
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
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('reports')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('salesAndProfitAnalytics')}</p>
        </div>
        
        <div className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-xl p-2 border border-gray-200 dark:border-gray-700">
          <Calendar size={18} className="text-gray-500 dark:text-gray-400 ml-2" />
          <input
            type="date"
            value={dateRange.startDate}
            onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
            className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white px-3 py-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-gray-500 dark:text-gray-400">{t('to')}</span>
          <input
            type="date"
            value={dateRange.endDate}
            onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
            className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white px-3 py-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => {
              const today = new Date();
              const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
              setDateRange({
                startDate: firstDay.toISOString().split('T')[0],
                endDate: today.toISOString().split('T')[0]
              });
            }}
            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-gray-700 dark:text-gray-300 text-sm transition"
          >
            {t('thisMonth')}
          </button>
        </div>
      </div>

      {reportData && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <DollarSign size={20} className="text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-gray-600 dark:text-gray-400">{t('totalRevenue')}</p>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(reportData.summary.total_revenue)}</p>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                  <TrendingDown size={20} className="text-red-600 dark:text-red-400" />
                </div>
                <p className="text-gray-600 dark:text-gray-400">{t('totalCost')}</p>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(reportData.summary.total_cost)}</p>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <TrendingUp size={20} className="text-green-600 dark:text-green-400" />
                </div>
                <p className="text-gray-600 dark:text-gray-400">{t('totalProfit')}</p>
              </div>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(reportData.summary.total_profit)}</p>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <BarChart3 size={20} className="text-purple-600 dark:text-purple-400" />
                </div>
                <p className="text-gray-600 dark:text-gray-400">{t('profitMargin')}</p>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{reportData.summary.profit_margin || 0}%</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-gray-900 dark:text-white font-semibold">{t('dailyBreakdown')}</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">{t('performanceByDay')}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm">{t('date')}</th>
                    <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm">{t('orders')}</th>
                    <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm">{t('revenue')}</th>
                    <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm">{t('cost')}</th>
                    <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm">{t('profit')}</th>
                    <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm">{t('margin')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {reportData.daily_breakdown.map((day, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                      <td className="px-6 py-4 text-gray-900 dark:text-white">{new Date(day.date).toLocaleDateString()}</td>
                      <td className="px-6 py-4 text-gray-700 dark:text-gray-300">{day.sales_count}</td>
                      <td className="px-6 py-4 text-gray-700 dark:text-gray-300">{formatCurrency(day.revenue)}</td>
                      <td className="px-6 py-4 text-red-600 dark:text-red-400">{formatCurrency(day.cost)}</td>
                      <td className="px-6 py-4 text-green-600 dark:text-green-400 font-semibold">{formatCurrency(day.profit)}</td>
                      <td className="px-6 py-4">
                        <span className={"px-2 py-1 rounded-full text-xs font-semibold " + (day.profit_margin >= 20 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400')}>
                          {day.profit_margin}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {reportData && reportData.summary.total_sales === 0 && (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <BarChart3 size={48} className="mx-auto text-gray-500 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">{t('noSalesDataForPeriod')}</p>
        </div>
      )}
    </div>
  );
};

export default Reports;
