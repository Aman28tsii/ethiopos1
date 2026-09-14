import React, { useState, useEffect } from 'react';
import API from '../../api/axios';
import { 
  RefreshCw, Loader2, CheckCircle, Clock, Sparkles, Bell, 
  Users, Eye, UserCheck, X
} from 'lucide-react';
import socket from '../../socket';
import { useLanguage } from '../../context/LanguageContext';
import { formatCurrency } from '../../utils/formatting';
import StatusBadge from '../../components/StatusBadge';

const TableStatus = () => {
  const { t } = useLanguage();
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [notification, setNotification] = useState('');
  const [selectedWaiter, setSelectedWaiter] = useState('');
  const [waiters, setWaiters] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedTableForAssign, setSelectedTableForAssign] = useState(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);
  const [userRole, setUserRole] = useState(null);

  useEffect(function() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setUserRole(user?.role);
    fetchTables();
    fetchWaiters();
    
    socket.on('table_status_updated', function(data) {
      fetchTables();
      setNotification(t('table') + ' ' + data.table_number + ' ' + t('isNow') + ' ' + data.status);
      setTimeout(function() { setNotification(''); }, 3000);
    });
    
    socket.on('order_ready_for_waiter', function(data) {
      setNotification(data.message);
      setTimeout(function() { setNotification(''); }, 5000);
    });
    
    return function() {
      socket.off('table_status_updated');
      socket.off('order_ready_for_waiter');
    };
  }, []);

  const fetchTables = async function() {
    setLoading(true);
    try {
      const response = await API.get('/tables');
      setTables(response.data.data || []);
    } catch (err) {
      console.error('Fetch tables error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchWaiters = async function() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user?.role !== 'owner' && user?.role !== 'admin') {
      setWaiters([]);
      return;
    }
    try {
      const response = await API.get('/orders/waiters');
      setWaiters(response.data.data || []);
    } catch (err) {
      console.log('Unable to fetch waiters');
      setWaiters([]);
    }
  };

  const fetchOrderDetails = async function(orderId) {
    try {
      const response = await API.get('/orders/' + orderId);
      setSelectedOrderDetails(response.data.data);
      setShowOrderModal(true);
    } catch (err) {
      console.error('Fetch order details error:', err);
    }
  };

  const updateTableStatus = async function(tableId, newStatus) {
    setUpdating(tableId);
    try {
      // ✅ FIXED: was '/orders/tables/' + tableId + '/status' — correct path is /tables/:id/status
      await API.put('/tables/' + tableId + '/status', { status: newStatus });
      fetchTables();
    } catch (err) {
      console.error('Update status error:', err);
      alert(err.response?.data?.error || t('failedToUpdateStatus'));
    } finally {
      setUpdating(null);
    }
  };

  const assignWaiter = async function(tableId, waiterId) {
    try {
      // ✅ FIXED: was '/orders/tables/' + tableId + '/assign-waiter' — correct path is /tables/:id/assign-waiter
      await API.put('/tables/' + tableId + '/assign-waiter', { waiter_id: waiterId });
      fetchTables();
      setShowAssignModal(false);
      setSelectedTableForAssign(null);
      setSelectedWaiter('');
    } catch (err) {
      console.error('Assign waiter error:', err);
      alert(err.response?.data?.error || t('failedToAssignWaiter'));
    }
  };

  const getStatusStyle = function(status) {
    const options = {
      available: { value: 'available', label: t('available'), color: 'bg-green-500', textColor: 'text-green-600 dark:text-green-400' },
      occupied: { value: 'occupied', label: t('occupied'), color: 'bg-red-500', textColor: 'text-red-600 dark:text-red-400' },
      reserved: { value: 'reserved', label: t('reserved'), color: 'bg-yellow-500', textColor: 'text-yellow-600 dark:text-yellow-400' },
      cleaning: { value: 'cleaning', label: t('cleaning'), color: 'bg-blue-500', textColor: 'text-blue-600 dark:text-blue-400' }
    };
    return options[status] || options.available;
  };

  const getStatusCount = function(statusValue) {
    return tables.filter(function(t) { return t.status === statusValue; }).length;
  };

  const isOwner = userRole === 'owner' || userRole === 'admin';

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="animate-spin text-blue-500" size={40} />
      </div>
    );
  }

  const availableCount = getStatusCount('available');
  const occupiedCount = getStatusCount('occupied');
  const reservedCount = getStatusCount('reserved');
  const cleaningCount = getStatusCount('cleaning');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('tableStatusManagement')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('manageTableAvailability')}</p>
        </div>
        <button onClick={fetchTables} className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-xl flex items-center gap-2 transition">
          <RefreshCw size={18} />
          {t('refresh')}
        </button>
      </div>

      {notification && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-blue-700 dark:text-blue-400 text-center animate-pulse">
          <Bell size={18} className="inline mr-2" />
          {notification}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <CheckCircle size={20} className="text-green-600 dark:text-green-400" />
            <span className="text-green-700 dark:text-green-400 font-semibold">{t('available')}</span>
          </div>
          <p className="text-2xl font-bold text-green-700 dark:text-green-400 mt-2">{availableCount}</p>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-red-600 dark:text-red-400" />
            <span className="text-red-700 dark:text-red-400 font-semibold">{t('occupied')}</span>
          </div>
          <p className="text-2xl font-bold text-red-700 dark:text-red-400 mt-2">{occupiedCount}</p>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <Clock size={20} className="text-yellow-600 dark:text-yellow-400" />
            <span className="text-yellow-700 dark:text-yellow-400 font-semibold">{t('reserved')}</span>
          </div>
          <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400 mt-2">{reservedCount}</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-blue-600 dark:text-blue-400" />
            <span className="text-blue-700 dark:text-blue-400 font-semibold">{t('cleaning')}</span>
          </div>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-400 mt-2">{cleaningCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {tables.map(function(table) {
          const statusStyle = getStatusStyle(table.status);
          return (
            <div key={table.id} className="bg-white dark:bg-gray-800 rounded-xl border-2 overflow-hidden transition-all border-gray-200 dark:border-gray-700">
              <div className={'p-4 ' + statusStyle.textColor + '/10 border-b border-gray-200 dark:border-gray-700'}>
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('table')} {table.table_number}</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">{t('capacity')}: {table.capacity} {t('seats')}</p>
                  </div>
                  <div className={'px-3 py-1 rounded-full ' + statusStyle.textColor + '/20 ' + statusStyle.textColor + ' text-sm font-semibold flex items-center gap-1'}>
                    {statusStyle.label}
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-3">
                {isOwner && (
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">{t('assignedWaiter')}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users size={14} className="text-gray-500 dark:text-gray-400" />
                        <span className="text-gray-700 dark:text-gray-300 text-sm">
                          {table.waiter_name || t('notAssigned')}
                        </span>
                      </div>
                      <button
                        onClick={function() {
                          setSelectedTableForAssign(table);
                          setSelectedWaiter(table.waiter_id || '');
                          setShowAssignModal(true);
                        }}
                        className="text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-2 py-1 rounded transition flex items-center gap-1"
                      >
                        <UserCheck size={12} />
                        {t('change')}
                      </button>
                    </div>
                  </div>
                )}

                {table.status === 'occupied' && table.current_order_number && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">{t('currentOrder')}</p>
                        <p className="text-gray-700 dark:text-gray-300 text-sm font-mono">{table.current_order_number}</p>
                      </div>
                      <button
                        onClick={function() { fetchOrderDetails(table.current_order_id); }}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-xs flex items-center gap-1"
                      >
                        <Eye size={12} />
                        {t('view')}
                      </button>
                    </div>
                  </div>
                )}

                {table.pending_order_id && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-2 border border-yellow-200 dark:border-yellow-800">
                    <p className="text-yellow-700 dark:text-yellow-400 text-xs">{t('pendingOrderWaiting')}</p>
                  </div>
                )}

                <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-gray-500 dark:text-gray-400 text-xs mb-2">{t('changeStatus')}:</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={function() { updateTableStatus(table.id, 'available'); }}
                      disabled={updating === table.id || table.status === 'available'}
                      className={'px-2 py-1.5 rounded-lg text-xs font-semibold transition ' + (table.status === 'available' ? 'bg-green-500 text-white opacity-50 cursor-not-allowed' : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800/50')}
                    >
                      {updating === table.id ? <Loader2 className="animate-spin inline" size={12} /> : t('available')}
                    </button>
                    <button
                      onClick={function() { updateTableStatus(table.id, 'occupied'); }}
                      disabled={updating === table.id || table.status === 'occupied'}
                      className={'px-2 py-1.5 rounded-lg text-xs font-semibold transition ' + (table.status === 'occupied' ? 'bg-red-500 text-white opacity-50 cursor-not-allowed' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800/50')}
                    >
                      {updating === table.id ? <Loader2 className="animate-spin inline" size={12} /> : t('occupied')}
                    </button>
                    <button
                      onClick={function() { updateTableStatus(table.id, 'reserved'); }}
                      disabled={updating === table.id || table.status === 'reserved'}
                      className={'px-2 py-1.5 rounded-lg text-xs font-semibold transition ' + (table.status === 'reserved' ? 'bg-yellow-500 text-white opacity-50 cursor-not-allowed' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-200 dark:hover:bg-yellow-800/50')}
                    >
                      {updating === table.id ? <Loader2 className="animate-spin inline" size={12} /> : t('reserved')}
                    </button>
                    <button
                      onClick={function() { updateTableStatus(table.id, 'cleaning'); }}
                      disabled={updating === table.id || table.status === 'cleaning'}
                      className={'px-2 py-1.5 rounded-lg text-xs font-semibold transition ' + (table.status === 'cleaning' ? 'bg-blue-500 text-white opacity-50 cursor-not-allowed' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/50')}
                    >
                      {updating === table.id ? <Loader2 className="animate-spin inline" size={12} /> : t('cleaning')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {tables.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400">{t('noTablesFound')}</p>
        </div>
      )}

      {/* Assign Waiter Modal */}
      {isOwner && showAssignModal && selectedTableForAssign && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full border border-gray-200 dark:border-gray-700">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('assignWaiterToTable')} {selectedTableForAssign.table_number}</h2>
              <button onClick={function() { setShowAssignModal(false); setSelectedTableForAssign(null); setSelectedWaiter(''); }} className="text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:text-gray-300">X</button>
            </div>
            <div className="p-5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('selectWaiter')}</label>
              <select 
                value={selectedWaiter} 
                onChange={function(e) { setSelectedWaiter(e.target.value); }} 
                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- {t('noWaiterAssigned')} --</option>
                {waiters.map(function(waiter) {
                  return (
                    <option key={waiter.id} value={waiter.id}>{waiter.name} ({waiter.email})</option>
                  );
                })}
              </select>
              <div className="flex gap-3">
                <button onClick={function() { assignWaiter(selectedTableForAssign.id, selectedWaiter || null); }} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition">{t('assign')}</button>
                <button onClick={function() { setShowAssignModal(false); setSelectedTableForAssign(null); setSelectedWaiter(''); }} className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-semibold transition">{t('cancel')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Order Details Modal */}
      {showOrderModal && selectedOrderDetails && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
            <div className="sticky top-0 bg-white dark:bg-gray-800 p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('orderDetails')}</h2>
              <button onClick={function() { setShowOrderModal(false); }} className="text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:text-gray-300">X</button>
            </div>
            <div className="p-4 space-y-4">
              <div><p className="text-gray-500 dark:text-gray-400 text-xs">{t('orderNumber')}</p><p className="text-gray-900 dark:text-white font-bold text-lg">{selectedOrderDetails.order_number}</p></div>
              <div><p className="text-gray-500 dark:text-gray-400 text-xs">{t('customer')}</p><p className="text-gray-900 dark:text-white">{selectedOrderDetails.customer_name || t('walkInCustomer')}</p></div>
              <div><p className="text-gray-500 dark:text-gray-400 text-xs">{t('status')}</p><StatusBadge status={selectedOrderDetails.status} /></div>
              <div><p className="text-gray-500 dark:text-gray-400 text-xs">{t('totalAmount')}</p><p className="text-green-600 dark:text-green-400 font-bold">{formatCurrency(selectedOrderDetails.total_amount)}</p></div>
              {selectedOrderDetails.notes && (<div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3"><p className="text-yellow-700 dark:text-yellow-400 text-xs">{t('specialInstructions')}</p><p className="text-gray-700 dark:text-gray-300 text-sm">{selectedOrderDetails.notes}</p></div>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TableStatus;