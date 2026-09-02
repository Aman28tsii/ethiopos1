import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import API from '../api/axios';
import socket from '../socket';
import { Bell, AlertTriangle, ShoppingBag, CheckCircle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { formatCurrency } from '../utils/formatting';

const RealTimeNotifications = memo(() => {
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  
  const lastNotificationRef = useRef({});
  const isFetchingRef = useRef(false);
  const socketInitializedRef = useRef(false);
  const intervalRef = useRef(null);
  const isMounted = useRef(true);

  const fetchNotifications = useCallback(async () => {
    if (isFetchingRef.current || !isMounted.current) return;
    isFetchingRef.current = true;
    
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const role = user?.role;
      const newNotifications = [];
      
      if (role === 'manager' || role === 'owner' || role === 'admin') {
        try {
          const lowStockRes = await API.get('/ingredients/low-stock-alert');
          const lowStockItems = lowStockRes.data.data || [];
          
          lowStockItems.forEach(item => {
            newNotifications.push({
              id: 'lowstock-' + item.id + '-' + Date.now(),
              type: 'warning',
              message: item.name + ' - ' + t('only') + ' ' + item.quantity + ' ' + item.unit + ' ' + t('left') + ' (' + t('min') + ': ' + item.min_stock + ')',
              time: new Date().toLocaleTimeString(),
              read: false,
              link: '/owner/inventory'
            });
          });
        } catch (err) {
          console.log('Low stock not available for this role');
        }
      }
      
      // ✅ FIX: Use correct endpoint - /kitchen/orders (matching backend)
      if (role === 'kitchen' || role === 'manager' || role === 'owner' || role === 'admin') {
        try {
          const pendingOrdersRes = await API.get('/kitchen/orders');
          const pendingOrders = pendingOrdersRes.data.data || [];
          const pendingCount = pendingOrders.filter(o => o.status === 'pending').length;
          
          if (pendingCount > 0) {
            newNotifications.push({
              id: 'pending-orders-' + Date.now(),
              type: 'info',
              message: pendingCount + ' ' + t('newOrdersWaiting'),
              time: new Date().toLocaleTimeString(),
              read: false,
              link: '/kitchen/orders'
            });
          }
        } catch (err) {
          console.log('Kitchen orders not available for this role');
        }
      }
      
      setNotifications(prev => {
        const existingIds = new Set(prev.map(n => n.id.split('-')[0]));
        const uniqueNew = newNotifications.filter(n => !existingIds.has(n.id.split('-')[0]));
        const result = [...uniqueNew, ...prev].slice(0, 20);
        setUnreadCount(prevCount => result.filter(n => !n.read).length);
        return result;
      });
      
    } catch (err) {
      console.error('Fetch notifications error:', err);
    } finally {
      isFetchingRef.current = false;
    }
  }, [t]);

  useEffect(() => {
    isMounted.current = true;
    fetchNotifications();
    
    intervalRef.current = setInterval(() => {
      if (isMounted.current) {
        fetchNotifications();
      }
    }, 60000);
    
    if (socket && socket.on && !socketInitializedRef.current) {
      socketInitializedRef.current = true;
      
      const handleNewOrder = (data) => {
        const notificationKey = 'new_order_' + (data.order_id || data.order_number || data.id);
        const now = Date.now();
        
        if (lastNotificationRef.current[notificationKey] && now - lastNotificationRef.current[notificationKey] < 5000) {
          return;
        }
        lastNotificationRef.current[notificationKey] = now;
        
        const newNotif = {
          id: 'socket-order-' + Date.now() + '-' + Math.random(),
          type: 'info',
          message: t('newOrderReceived') + ' #' + (data.order_number || data.order_id || data.id) + '!',
          time: new Date().toLocaleTimeString(),
          read: false,
          link: '/kitchen/orders'
        };
        
        setNotifications(prev => {
          const exists = prev.some(n => n.message === newNotif.message);
          if (exists) return prev;
          const result = [newNotif, ...prev].slice(0, 20);
          setUnreadCount(prevCount => result.filter(n => !n.read).length);
          return result;
        });
        
        try {
          const audio = new Audio('/notification.mp3');
          audio.play().catch(e => console.log('Audio not supported'));
        } catch (e) {
          console.log('Sound error:', e);
        }
      };
      
      const handleOrderStatusUpdate = (data) => {
        const notificationKey = 'status_' + data.order_id + '_' + data.status;
        const now = Date.now();
        
        if (lastNotificationRef.current[notificationKey] && now - lastNotificationRef.current[notificationKey] < 5000) {
          return;
        }
        lastNotificationRef.current[notificationKey] = now;
        
        const newNotif = {
          id: 'socket-status-' + Date.now() + '-' + Math.random(),
          type: 'success',
          message: t('order') + ' #' + data.order_id + ' ' + t('isNow') + ' ' + data.status + '!',
          time: new Date().toLocaleTimeString(),
          read: false,
          link: data.status === 'ready' ? '/cashier/pos' : '/kitchen/orders'
        };
        
        setNotifications(prev => {
          const exists = prev.some(n => n.message === newNotif.message);
          if (exists) return prev;
          const result = [newNotif, ...prev].slice(0, 20);
          setUnreadCount(prevCount => result.filter(n => !n.read).length);
          return result;
        });
      };
      
      socket.on('new_order', handleNewOrder);
      socket.on('order_status_updated', handleOrderStatusUpdate);
    }
    
    return () => {
      isMounted.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (socket && socket.off) {
        socket.off('new_order');
        socket.off('order_status_updated');
        socket.off('low_stock_alert');
      }
      socketInitializedRef.current = false;
    };
  }, [fetchNotifications, t]);

  const markAsRead = useCallback((id) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  const getIcon = useCallback((type) => {
    switch(type) {
      case 'warning': return <AlertTriangle size={16} className="text-yellow-400" />;
      case 'success': return <CheckCircle size={16} className="text-green-400" />;
      case 'info': return <ShoppingBag size={16} className="text-blue-400" />;
      default: return <Bell size={16} className="text-gray-500 dark:text-gray-400" />;
    }
  }, []);

  const getBgColor = useCallback((type, read) => {
    if (read) return 'bg-gray-800';
    switch(type) {
      case 'warning': return 'bg-yellow-500/10';
      case 'success': return 'bg-green-500/10';
      case 'info': return 'bg-blue-500/10';
      default: return 'bg-gray-700';
    }
  }, []);

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="p-2 hover:bg-gray-700 rounded-lg transition-colors relative"
      >
        <Bell size={20} className="text-gray-500 dark:text-gray-400" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      
      {showDropdown && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h3 className="font-semibold text-gray-900 dark:text-white">{t('notifications')}</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                {t('markAllRead')}
              </button>
            )}
          </div>
          
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Bell size={32} className="mx-auto mb-2 text-gray-600" />
                <p className="text-sm">{t('noNotifications')}</p>
              </div>
            ) : (
              notifications.map(notif => (
                <div
                  key={notif.id}
                  className={"p-3 border-b border-gray-700 hover:bg-gray-700/50 transition cursor-pointer " + getBgColor(notif.type, notif.read)}
                  onClick={() => markAsRead(notif.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {getIcon(notif.type)}
                    </div>
                    <div className="flex-1">
                      <p className={"text-sm " + (notif.read ? 'text-gray-400' : 'text-white')}>
                        {notif.message}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{notif.time}</p>
                    </div>
                    {!notif.read && (
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
});

RealTimeNotifications.displayName = 'RealTimeNotifications';

export default RealTimeNotifications;