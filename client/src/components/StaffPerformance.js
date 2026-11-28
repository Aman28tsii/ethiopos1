import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import API from '../api/axios';
import { Award, Loader2, Medal, Crown } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { formatCurrency } from '../utils/formatting';

const StaffPerformance = memo(() => {
  const { t } = useLanguage();
  const [performance, setPerformance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const intervalRef = useRef(null);
  const isMounted = useRef(true);

  const fetchPerformance = useCallback(async () => {
    if (!isMounted.current) return;
    
    setLoading(true);
    try {
      const response = await API.get('/auth/performance', { params: { period } });
      if (isMounted.current && response.data?.data) {
        setPerformance(response.data.data);
      }
    } catch (err) {
      console.error('Fetch performance error:', err);
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [period]);

  useEffect(() => {
    isMounted.current = true;
    fetchPerformance();
    
    intervalRef.current = setInterval(() => {
      if (isMounted.current) {
        fetchPerformance();
      }
    }, 60000);
    
    return () => {
      isMounted.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchPerformance]);

  const getPeriodText = useCallback(() => {
    switch(period) {
      case 'week': return t('last7Days');
      case 'month': return t('last30Days');
      case 'year': return t('last365Days');
      default: return t('last30Days');
    }
  }, [period, t]);

  const getTopPerformer = useCallback(() => {
    if (!performance?.sales_by_staff || performance.sales_by_staff.length === 0) return null;
    return performance.sales_by_staff.reduce((max, item) => 
      parseFloat(item.total_revenue) > parseFloat(max.total_revenue) ? item : max, performance.sales_by_staff[0]);
  }, [performance]);

  const topPerformer = getTopPerformer();

  if (loading && !performance) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  if (!performance) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center flex-wrap gap-4">
        <div>
          <h3 className="text-gray-900 dark:text-white font-semibold flex items-center gap-2">
            <Award size={20} className="text-yellow-400" />
            {t('staffPerformance')}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{getPeriodText()}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPeriod('week')}
            className={"px-3 py-1 rounded-lg text-sm transition " + (period === 'week' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white')}
          >
            {t('week')}
          </button>
          <button
            onClick={() => setPeriod('month')}
            className={"px-3 py-1 rounded-lg text-sm transition " + (period === 'month' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white')}
          >
            {t('month')}
          </button>
          <button
            onClick={() => setPeriod('year')}
            className={"px-3 py-1 rounded-lg text-sm transition " + (period === 'year' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white')}
          >
            {t('year')}
          </button>
        </div>
      </div>

      {topPerformer && (
        <div className="m-4 p-4 bg-amber-500/10 rounded-xl border border-yellow-500/30">
          <div className="flex items-center gap-3">
            <Crown size={28} className="text-yellow-400" />
            <div>
              <p className="text-yellow-400 text-xs font-semibold">{t('topPerformer')}</p>
              <p className="text-gray-900 dark:text-white font-bold text-lg">{topPerformer.name}</p>
              <p className="text-gray-500 dark:text-gray-400 text-sm">{topPerformer.role} • {formatCurrency(topPerformer.total_revenue)} {t('revenue')}</p>
            </div>
          </div>
        </div>
      )}

      {performance.sales_by_staff && performance.sales_by_staff.length > 0 ? (
        <div className="p-4 overflow-x-auto">
          <h4 className="text-gray-900 dark:text-white font-medium mb-3">{t('salesPerformance')}</h4>
          <table className="w-full text-sm min-w-[500px]">
            <thead className="bg-gray-700/50">
              <tr>
                <th className="px-4 py-2 text-left text-gray-500 dark:text-gray-400">{t('staff')}</th>
                <th className="px-4 py-2 text-left text-gray-500 dark:text-gray-400">{t('role')}</th>
                <th className="px-4 py-2 text-right text-gray-500 dark:text-gray-400">{t('sales')}</th>
                <th className="px-4 py-2 text-right text-gray-500 dark:text-gray-400">{t('revenue')}</th>
                <th className="px-4 py-2 text-right text-gray-500 dark:text-gray-400">{t('profit')}</th>
                <th className="px-4 py-2 text-right text-gray-500 dark:text-gray-400">{t('avgOrder')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {performance.sales_by_staff.slice(0, 5).map((staff, idx) => (
                <tr key={staff.id} className="hover:bg-gray-700/50">
                  <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
                    {idx === 0 && <Medal size={14} className="inline text-yellow-400 mr-1" />}
                    {staff.name}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 capitalize">{t(staff.role)}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{staff.total_sales || 0}</td>
                  <td className="px-4 py-3 text-right text-green-400">{formatCurrency(staff.total_revenue)}</td>
                  <td className="px-4 py-3 text-right text-blue-400">{formatCurrency(staff.total_profit)}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{formatCurrency(staff.avg_order_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {performance.sales_by_staff.length > 5 && (
            <p className="text-gray-500 text-xs text-center mt-3">
              +{performance.sales_by_staff.length - 5} {t('moreStaff')}
            </p>
          )}
        </div>
      ) : (
        <div className="p-8 text-center text-gray-500">
          <p>{t('noSalesData')}</p>
        </div>
      )}
    </div>
  );
});

StaffPerformance.displayName = 'StaffPerformance';

export default StaffPerformance;
