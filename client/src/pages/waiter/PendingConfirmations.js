import React, { useState, useEffect } from 'react';
import API from '../../api/axios';
import { CheckCircle, Clock, Users, Utensils, Loader2, Bell, RefreshCw } from 'lucide-react';
import socket from '../../socket';
import { useLanguage } from '../../context/LanguageContext';
import { formatCurrency } from '../../utils/formatting';
import StatusBadge from '../../components/StatusBadge';

const PendingConfirmations = () => {
  const { t } = useLanguage();
  const [pendingOrders, setPendingOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [notification, setNotification] = useState('');

  useEffect(function() {
    fetchPendingOrders();
    
    socket.on('new_pending_order', function(data) {
      fetchPendingOrders();
      setNotification('New QR order from ' + (data.customer_name || 'Customer'));
      setTimeout(function() { setNotification(''); }, 5000);
      const audio = new Audio('/notification.mp3');
      audio.play().catch(function(e) { console.log('Audio not supported'); });
    });
    
    return function() {
      socket.off('new_pending_order');
    };
  }, []);

  const fetchPendingOrders = async function() {
    setLoading(true);
    try {
      const response = await API.get('/orders/pending-confirmation');
      setPendingOrders(response.data.data || []);
    } catch (err) {
      console.error('Fetch pending orders error:', err);
    } finally {
      setLoading(false);
    }
  };

  const confirmOrder = async function(orderId) {
    setProcessing(orderId);
    try {
      const response = await API.put('/orders/confirm/' + orderId);
      if (response.data.success) {
        alert('Order confirmed! Sent to kitchen.');
        setPendingOrders(function(prev) { return prev.filter(function(o) { return o.id !== orderId; }); });
      }
    } catch (err) {
      console.error('Confirm order error:', err);
      alert(err.response?.data?.error || 'Failed to confirm order');
    } finally {
      setProcessing(null);
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('pendingOrderConfirmations')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('reviewConfirmOrders')}</p>
        </div>
        <button
          onClick={fetchPendingOrders}
          className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-xl flex items-center gap-2 transition"
        >
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

      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <Clock size={24} className="text-yellow-600 dark:text-yellow-400" />
          <div>
            <p className="text-yellow-700 dark:text-yellow-400 font-semibold">{t('pendingConfirmations')}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{pendingOrders.length} {pendingOrders.length !== 1 ? t('orders') : t('order')}</p>
          </div>
        </div>
      </div>

      {pendingOrders.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center border border-gray-200 dark:border-gray-700">
          <CheckCircle size={48} className="mx-auto text-green-500 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-lg">{t('noPendingConfirmations')}</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{t('ordersWillAppearHere')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {pendingOrders.map(function(order) {
            return (
              <div key={order.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:border-yellow-500/50 transition-all shadow-sm hover:shadow-md">
                <div className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 p-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <Utensils size={18} className="text-yellow-600 dark:text-yellow-400" />
                        <span className="text-yellow-700 dark:text-yellow-400 text-sm font-semibold">QR Order</span>
                      </div>
                      <p className="text-gray-900 dark:text-white font-bold text-xl mt-1">{order.order_number}</p>
                      <p className="text-gray-500 dark:text-gray-400 text-sm">{t('table')}: {order.table_number}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-500 dark:text-gray-400 text-sm">{t('total')}</p>
                      <p className="text-green-600 dark:text-green-400 font-bold text-xl">{formatCurrency(order.total_amount)}</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div>
                      <p className="text-gray-500 dark:text-gray-400 text-xs">{t('customer')}</p>
                      <p className="text-gray-900 dark:text-white font-medium">{order.customer_name || t('walkInCustomer')}</p>
                    </div>
                    {order.customer_phone && (
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs">{t('phone')}</p>
                        <p className="text-gray-900 dark:text-white font-medium">{order.customer_phone}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-gray-500 dark:text-gray-400 text-xs">{t('orderedAt')}</p>
                      <p className="text-gray-900 dark:text-white font-medium">{new Date(order.created_at).toLocaleTimeString()}</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">{t('items')}:</p>
                  <div className="space-y-1">
                    {order.items && order.items.map(function(item, idx) {
                      return (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-gray-700 dark:text-gray-300">
                            <span className="text-gray-900 dark:text-white font-bold">{item.quantity}x</span> {item.name}
                          </span>
                          <span className="text-gray-600 dark:text-gray-400">{formatCurrency(item.price * item.quantity)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {order.notes && (
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-yellow-50 dark:bg-yellow-900/20">
                    <p className="text-yellow-700 dark:text-yellow-400 text-xs mb-1">{t('specialInstructions')}:</p>
                    <p className="text-gray-700 dark:text-gray-300 text-sm italic">"{order.notes}"</p>
                  </div>
                )}

                <div className="p-4">
                  <button
                    onClick={function() { confirmOrder(order.id); }}
                    disabled={processing === order.id}
                    className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition flex items-center justify-center gap-2"
                  >
                    {processing === order.id ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
                    {t('confirmOrder')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PendingConfirmations;
