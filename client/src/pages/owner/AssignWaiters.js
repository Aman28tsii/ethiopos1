import React, { useState, useEffect } from 'react';
import API from '../../api/axios';
import { Users, UserCheck, RefreshCw, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const AssignWaiters = () => {
  const { t } = useLanguage();
  const [tables, setTables] = useState([]);
  const [waiters, setWaiters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [selectedWaiters, setSelectedWaiters] = useState({});
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tablesRes, waitersRes] = await Promise.all([
        API.get('/tables'),
        API.get('/orders/waiters')
      ]);
      setTables(tablesRes.data.data || []);
      setWaiters(waitersRes.data.data || []);
      
      const initialSelected = {};
      tablesRes.data.data.forEach(table => {
        if (table.assigned_waiter_id) {
          initialSelected[table.id] = table.assigned_waiter_id;
        }
      });
      setSelectedWaiters(initialSelected);
    } catch (err) {
      console.error('Fetch data error:', err);
      setNotification(t('failedToLoadData'));
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  const assignWaiter = async (tableId, waiterId) => {
    setSaving(tableId);
    try {
      await API.put(`/orders/tables/${tableId}/assign-waiter`, { waiter_id: waiterId });
      setSelectedWaiters(prev => ({ ...prev, [tableId]: waiterId }));
      setNotification(t('waiterAssignedSuccessfully'));
      setTimeout(() => setNotification(null), 2000);
    } catch (err) {
      console.error('Assign error:', err);
      setNotification(t('failedToAssignWaiter'));
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setSaving(null);
    }
  };

  const getStatusBadge = (status) => {
    const colors = {
      available: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
      occupied: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
      reserved: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
      cleaning: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
    };
    return colors[status] || 'bg-gray-100 dark:bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-600 dark:text-gray-300';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="animate-spin text-blue-500" size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white">{t('assignWaitersToTables')}</h1>
          <p className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 mt-1">{t('assignWaitersDescription')}</p>
        </div>
        <button
          onClick={fetchData}
          className="bg-gray-100 dark:bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300 px-4 py-2 rounded-xl flex items-center gap-2 transition"
        >
          <RefreshCw size={18} />
          {t('refresh')}
        </button>
      </div>

      {notification && (
        <div className={`rounded-xl p-3 text-center ${
          notification.includes('success') 
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
            : notification.includes('Failed')
            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
        }`}>
          {notification}
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <p className="text-blue-700 dark:text-blue-400 text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          💡 {t('assignWaitersInfo')}
        </p>
      </div>

      {/* Waiters List Summary */}
      <div className="bg-white dark:bg-white dark:bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-blue-600 dark:text-blue-400" />
            <span className="text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300">{t('availableWaiters')}:</span>
          </div>
          <span className="text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white font-bold">{waiters.length}</span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            <UserCheck size={18} className="text-green-600 dark:text-green-400" />
            <span className="text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300">{t('assignedTables')}:</span>
          </div>
          <span className="text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white font-bold">
            {Object.values(selectedWaiters).filter(w => w && w !== '').length} / {tables.length}
          </span>
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {tables.map(table => (
          <div key={table.id} className="bg-white dark:bg-white dark:bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700 overflow-hidden hover:border-blue-500/50 transition-all shadow-sm hover:shadow-md">
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-4 border-b border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white">{t('table')} {table.table_number}</h3>
                  <p className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 text-sm">{t('capacity')}: {table.capacity} {t('seats')}</p>
                </div>
                <div className="text-right">
                  <p className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 text-xs">{t('currentStatus')}</p>
                  <p className={`text-sm font-semibold capitalize ${getStatusBadge(table.status)}`}>
                    {t(table.status)}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300 mb-2">{t('assignedWaiter')}</label>
              <div className="flex gap-3">
                <select
                  value={selectedWaiters[table.id] || ''}
                  onChange={(e) => assignWaiter(table.id, parseInt(e.target.value))}
                  disabled={saving === table.id}
                  className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-50 dark:bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="">-- {t('selectWaiter')} --</option>
                  {waiters.map(waiter => (
                    <option key={waiter.id} value={waiter.id}>
                      {waiter.name} ({waiter.email})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const selectElement = document.querySelector(`select[data-table="${table.id}"]`);
                    const currentValue = selectedWaiters[table.id];
                    if (currentValue) {
                      assignWaiter(table.id, currentValue);
                    }
                  }}
                  disabled={saving === table.id || !selectedWaiters[table.id]}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-gray-900 dark:text-gray-900 dark:text-white rounded-xl transition disabled:opacity-50"
                >
                  {saving === table.id ? <Loader2 className="animate-spin" size={18} /> : <UserCheck size={18} />}
                </button>
              </div>
              {selectedWaiters[table.id] && (
                <div className="mt-2 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle size={12} />
                  {t('waiterAssigned')}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {tables.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-white dark:bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700">
          <Users size={48} className="mx-auto text-gray-500 dark:text-gray-500 dark:text-gray-400 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400">{t('noTablesFound')}</p>
        </div>
      )}

      {waiters.length === 0 && tables.length > 0 && (
        <div className="text-center py-6 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800">
          <AlertCircle size={24} className="mx-auto text-yellow-600 dark:text-yellow-400 mb-2" />
          <p className="text-yellow-700 dark:text-yellow-400">{t('noWaitersAvailable')}</p>
          <p className="text-yellow-600 dark:text-yellow-500 text-sm mt-1">{t('addWaitersFirst')}</p>
        </div>
      )}
    </div>
  );
};

export default AssignWaiters;