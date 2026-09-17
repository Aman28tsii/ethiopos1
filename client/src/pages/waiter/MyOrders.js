import React, { useState, useEffect } from 'react';
import API from '../../api/axios';
import { Clock, CheckCircle, Coffee, ChefHat, Loader2, RefreshCw, Bell, Utensils, Eye } from 'lucide-react';
import socket from '../../socket';
import { useLanguage } from '../../context/LanguageContext';
import { formatCurrency } from '../../utils/formatting';
import StatusBadge from '../../components/StatusBadge';

const MyOrders = () => {
  const { t } = useLanguage();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);

  useEffect(function() {
    fetchOrders();
    
    socket.on('order_status_updated', function(data) {
      fetchOrders();
      if (data.status === 'ready') {
        setNotification('Order #' + data.order_id + ' is now ready!');
        setTimeout(function() { setNotification(null); }, 5000);
      }
    });
    
    socket.on('order_ready_for_waiter', function(data) {
      fetchOrders();
      setNotification(data.message);
      setTimeout(function() { setNotification(null); }, 5000);
      try {
        const audio = new Audio('/notification.mp3');
        audio.play().catch(function(e) { console.log('Audio not supported'); });
      } catch(e) {}
    });
    
    socket.on('new_order', function(data) {
      fetchOrders();
      setNotification('New order received #' + data.order_number + '!');
      setTimeout(function() { setNotification(null); }, 5000);
    });
    
    return function() {
      socket.off('order_status_updated');
      socket.off('order_ready_for_waiter');
      socket.off('new_order');
    };
  }, []);

  const fetchOrders = async function() {
    setLoading(true);
    try {
      const response = await API.get('/orders/my-orders');
      setOrders(response.data.data || []);
    } catch (err) {
      console.error('Fetch orders error:', err);
      if (err.response?.status === 401) {
        setNotification(t('sessionExpired'));
      } else if (err.response?.status === 403) {
        setNotification(t('accessDenied'));
      } else {
        setNotification(t('failedToLoadOrders'));
      }
      setTimeout(function() { setNotification(null); }, 5000);
    } finally {
      setLoading(false);
    }
  };

  const confirmPickup = async function(orderId) {
    setConfirmingId(orderId);
    try {
      const res = await API.post(`/orders/${orderId}/confirm-pickup`);
      if (res.data.success) {
        setNotification(`✅ Pickup confirmed for order #${orderId}. Cashier notified.`);
        setTimeout(function() { setNotification(null); }, 4000);
        fetchOrders();
      }
    } catch (err) {
      console.error('Confirm pickup error:', err);
      alert(err.response?.data?.error || 'Failed to confirm pickup');
    } finally {
      setConfirmingId(null);
    }
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
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('myActiveOrders')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('ordersYouConfirmed')}</p>
        </div>
        <button onClick={fetchOrders} className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-xl flex items-center gap-2 transition">
          <RefreshCw size={18} />
          {t('refresh')}
        </button>
      </div>

      {notification && (
        <div className={'rounded-xl p-3 text-center animate-pulse ' + (notification.includes('ready') || notification.includes('Pickup') ? 'bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' : notification.includes('Failed') ? 'bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400' : 'bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400')}>
          <Bell size={18} className="inline mr-2" />
          {notification}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-3 text-center border border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400 text-xs">{t('totalActive')}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{orders.length}</p>
        </div>
        <div className="bg-yellow-100 dark:bg-yellow-900/30 rounded-xl p-3 text-center border border-yellow-200 dark:border-yellow-800">
          <p className="text-yellow-700 dark:text-yellow-400 text-xs">{t('inKitchen')}</p>
          <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{orders.filter(function(o) { return o.status === 'pending'; }).length}</p>
        </div>
        <div className="bg-orange-100 dark:bg-orange-900/30 rounded-xl p-3 text-center border border-orange-200 dark:border-orange-800">
          <p className="text-orange-700 dark:text-orange-400 text-xs">{t('preparing')}</p>
          <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">{orders.filter(function(o) { return o.status === 'preparing'; }).length}</p>
        </div>
        <div className="bg-green-100 dark:bg-green-900/30 rounded-xl p-3 text-center border border-green-200 dark:border-green-800">
          <p className="text-green-700 dark:text-green-400 text-xs">{t('readyToServe')}</p>
          <p className="text-2xl font-bold text-green-700 dark:text-green-400">{orders.filter(function(o) { return o.status === 'ready'; }).length}</p>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center border border-gray-200 dark:border-gray-700">
          <Utensils size={48} className="mx-auto text-gray-500 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-lg">{t('noActiveOrders')}</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{t('ordersWillAppearHere')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {orders.map(function(order) {
            return (
              <div key={order.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:border-blue-500/50 transition-all shadow-sm hover:shadow-md">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between items-start flex-wrap gap-2">
                    <div>
                      <p className="text-gray-900 dark:text-white font-bold text-lg">{order.order_number}</p>
                      <p className="text-gray-500 dark:text-gray-400 text-sm">{t('table')}: {order.table_number}</p>
                    </div>
                    <div className="text-right">
                      <StatusBadge status={order.status} />
                      <p className="text-green-600 dark:text-green-400 font-bold mt-1">{formatCurrency(order.total_amount)}</p>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-gray-500 dark:text-gray-400 text-xs mb-2">{t('customer')}: {order.customer_name || t('walkInCustomer')}</p>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <p className="text-gray-500 dark:text-gray-400 text-xs mb-2">{t('items')}:</p>
                    {order.items && order.items.slice(0, 3).map(function(item, idx) {
                      return (
                        <div key={idx} className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700 dark:text-gray-300">{item.quantity}x {item.name}</span>
                          <span className="text-gray-700 dark:text-gray-300">{formatCurrency(item.price * item.quantity)}</span>
                        </div>
                      );
                    })}
                    {order.items && order.items.length > 3 && (
                      <p className="text-gray-500 dark:text-gray-400 text-xs">+{order.items.length - 3} {t('moreItems')}</p>
                    )}
                  </div>
                  {order.notes && (
                    <div className="mt-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-2">
                      <p className="text-yellow-700 dark:text-yellow-400 text-xs">{t('note')}: {order.notes}</p>
                    </div>
                  )}

                  {/* WAITER PICKUP CONFIRMATION */}
                  {order.status === 'ready' && (
                    <button
                      onClick={function() { confirmPickup(order.id); }}
                      disabled={confirmingId === order.id}
                      className="mt-3 w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {confirmingId === order.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                      Confirm Pickup — Send to Cashier
                    </button>
                  )}

                  <button
                    onClick={function() { setSelectedOrder(order); }}
                    className="mt-3 w-full py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-1"
                  >
                    <Eye size={14} />
                    {t('viewDetails')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
            <div className="sticky top-0 bg-white dark:bg-gray-800 p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('orderDetails')}</h2>
              <button onClick={function() { setSelectedOrder(null); }} className="text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">X</button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-xs">{t('orderNumber')}</p>
                <p className="text-gray-900 dark:text-white font-bold">{selectedOrder.order_number}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-xs">{t('customer')}</p>
                <p className="text-gray-900 dark:text-white">{selectedOrder.customer_name || t('walkInCustomer')}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-xs">{t('table')}</p>
                <p className="text-gray-900 dark:text-white">{t('table')} {selectedOrder.table_number}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-xs">{t('status')}</p>
                <StatusBadge status={selectedOrder.status} />
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400 text-xs">{t('items')}</p>
                {selectedOrder.items && selectedOrder.items.map(function(item, idx) {
                  return (
                    <div key={idx} className="flex justify-between text-sm py-1">
                      <span className="text-gray-700 dark:text-gray-300">{item.quantity}x {item.name}</span>
                      <span className="text-gray-700 dark:text-gray-300">{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
                <div className="flex justify-between font-bold">
                  <span className="text-gray-900 dark:text-white">{t('total')}</span>
                  <span className="text-green-600 dark:text-green-400">{formatCurrency(selectedOrder.total_amount)}</span>
                </div>
              </div>
              {selectedOrder.notes && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3">
                  <p className="text-yellow-700 dark:text-yellow-400 text-xs">{t('specialInstructions')}</p>
                  <p className="text-gray-700 dark:text-gray-300">{selectedOrder.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyOrders;