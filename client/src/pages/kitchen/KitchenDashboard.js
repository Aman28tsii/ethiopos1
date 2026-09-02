import React, { useState, useEffect } from 'react';
import API from '../../api/axios';
import socket from '../../socket';
import { ChefHat, Clock, CheckCircle, Loader2, Bell, Utensils } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import StatusBadge from '../../components/StatusBadge';

const KitchenDashboard = () => {
  const { t } = useLanguage();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState('');
  const [activeTab, setActiveTab] = useState('active');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = function() {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return function() { window.removeEventListener('resize', checkMobile); };
  }, []);

  const fetchOrders = async function() {
    try {
      // ✅ FIX: Use correct endpoint - /kitchen/orders (matching backend route)
      const response = await API.get('/kitchen/orders');
      setOrders(response.data.data || []);
    } catch (err) {
      console.error('Fetch orders error:', err);
    } finally {
      setLoading(false);
    }
  };

  const playSound = function() {
    try {
      const audio = new Audio('/notification.mp3');
      audio.play().catch(function(e) { console.log('Audio not supported'); });
    } catch (e) {
      console.log('Sound error:', e);
    }
  };

  const updateStatus = async function(orderId, status) {
    try {
      // ✅ FIX: Use correct endpoint
      await API.put(`/kitchen/orders/${orderId}/status`, { status: status });
      fetchOrders();
    } catch (err) {
      console.error('Update error:', err);
      alert(t('failedToUpdateOrderStatus'));
    }
  };

  useEffect(function() {
    fetchOrders();
    
    socket.on('new_order', function(data) {
      console.log('New order:', data);
      playSound();
      fetchOrders();
      setNotification('New order received #' + (data.order_number || data.order_id) + '!');
      setTimeout(function() { setNotification(''); }, 5000);
    });
    
    socket.on('order_status_updated', function(data) {
      fetchOrders();
    });
    
    return function() {
      socket.off('new_order');
      socket.off('order_status_updated');
    };
  }, []);

  const getStatusButton = function(status, orderId) {
    if (status === 'pending') {
      return React.createElement('button', {
        onClick: function() { updateStatus(orderId, 'preparing'); },
        className: 'w-full py-3 sm:py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm sm:text-base font-bold transition-all active:scale-95'
      }, 'Start Cooking');
    }
    if (status === 'preparing') {
      return React.createElement('button', {
        onClick: function() { updateStatus(orderId, 'ready'); },
        className: 'w-full py-3 sm:py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm sm:text-base font-bold transition-all active:scale-95'
      }, 'Mark Ready');
    }
    if (status === 'ready') {
      return React.createElement('div', {
        className: 'w-full py-3 sm:py-4 bg-gray-100 dark:bg-gray-700 text-green-600 dark:text-green-400 rounded-xl text-sm sm:text-base font-bold text-center'
      }, 'Ready for Pickup');
    }
    return null;
  };

  const pendingOrders = orders.filter(function(o) { return o.status === 'pending'; });
  const preparingOrders = orders.filter(function(o) { return o.status === 'preparing'; });
  const readyOrders = orders.filter(function(o) { return o.status === 'ready'; });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <Loader2 className="animate-spin text-blue-500" size={48} />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-20 md:pb-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t('kitchenDashboard')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('manageFoodPreparation')}</p>
        </div>
        
        <div className="flex items-center gap-3 sm:gap-4 bg-white dark:bg-gray-800 rounded-xl px-3 sm:px-4 py-2 w-full sm:w-auto justify-between border border-gray-200 dark:border-gray-700">
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('pending')}</p>
            <p className="text-lg sm:text-xl font-bold text-yellow-600 dark:text-yellow-400">{pendingOrders.length}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('preparing')}</p>
            <p className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-400">{preparingOrders.length}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('ready')}</p>
            <p className="text-lg sm:text-xl font-bold text-green-600 dark:text-green-400">{readyOrders.length}</p>
          </div>
        </div>
      </div>

      {notification && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 sm:p-4 text-blue-700 dark:text-blue-400 text-center animate-pulse text-sm sm:text-base">
          {notification}
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={function() { setActiveTab('active'); }}
          className={'px-4 sm:px-6 py-2 sm:py-3 font-semibold transition-all whitespace-nowrap text-sm sm:text-base ' + (activeTab === 'active' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300')}
        >
          {t('active')} ({pendingOrders.length + preparingOrders.length})
        </button>
        <button
          onClick={function() { setActiveTab('ready'); }}
          className={'px-4 sm:px-6 py-2 sm:py-3 font-semibold transition-all whitespace-nowrap text-sm sm:text-base ' + (activeTab === 'ready' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300')}
        >
          {t('ready')} ({readyOrders.length})
        </button>
      </div>

      {(activeTab === 'active' ? pendingOrders.concat(preparingOrders) : readyOrders).length === 0 ? (
        <div className="text-center py-12 sm:py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <ChefHat size={isMobile ? 48 : 64} className="mx-auto text-gray-500 dark:text-gray-600 mb-3 sm:mb-4" />
          <p className="text-gray-500 dark:text-gray-400 text-base sm:text-lg">{t('noOrdersToDisplay')}</p>
          <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-1">{t('ordersWillAppearHere')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {(activeTab === 'active' ? pendingOrders.concat(preparingOrders) : readyOrders).map(function(order) {
            return (
              <div key={order.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:border-gray-300 dark:hover:border-gray-600 transition-all shadow-sm hover:shadow-md">
                <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between items-start flex-wrap gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900 dark:text-white text-sm sm:text-base md:text-lg truncate">
                        {t('order')} #{order.order_number}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {new Date(order.created_at).toLocaleTimeString()}
                      </p>
                      {order.table_number && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('table')}: {order.table_number}</p>
                      )}
                    </div>
                    <StatusBadge status={order.status} />
                  </div>
                  {order.customer_name && (
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 truncate">{t('customer')}: {order.customer_name}</p>
                  )}
                </div>

                <div className="p-3 sm:p-4">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">{t('items')}:</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {order.items?.slice(0, isMobile ? 3 : 4).map(function(item, idx) {
                      return (
                        <div key={idx} className="flex justify-between items-center text-xs sm:text-sm">
                          <span className="text-gray-600 dark:text-gray-300 truncate">
                            <span className="font-bold text-gray-800 dark:text-gray-200">{item.quantity}x</span> {item.name}
                          </span>
                        </div>
                      );
                    })}
                    {order.items?.length > (isMobile ? 3 : 4) && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">+{order.items.length - (isMobile ? 3 : 4)} {t('more')}</p>
                    )}
                  </div>
                </div>

                <div className="p-3 sm:p-4 border-t border-gray-100 dark:border-gray-700">
                  {getStatusButton(order.status, order.order_id)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default KitchenDashboard;