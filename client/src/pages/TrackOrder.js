import React, { useState, useEffect } from 'react';
import API from '../api/axios';
import { 
  Clock, CheckCircle, Coffee, ChefHat, Truck, AlertCircle, 
  RefreshCw, ShoppingBag, Phone, MapPin, Calendar, User,
  Package, Utensils, Timer, Search
} from 'lucide-react';
import socket from '../socket';
import { formatCurrency, formatDate, getOrderStatusInfo } from '../utils/formatting';
import StatusBadge from '../components/StatusBadge';

const TrackOrder = () => {
  const [orderNumber, setOrderNumber] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [orders, setOrders] = useState([]);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const [timer, setTimer] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(20);
  const [statusMessage, setStatusMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [timeline, setTimeline] = useState([]);
  const [searchMode, setSearchMode] = useState('order');

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const order = urlParams.get('order');
    if (order) {
      setOrderNumber(order);
      fetchOrder(order);
    }

    socket.on('order_status_updated', (data) => {
      if (orderNumber && data.order_id.toString() === orderNumber.toString()) {
        fetchOrder(orderNumber);
      }
    });

    socket.on('order_items_added', (data) => {
      if (orderNumber && data.order_number === orderNumber) {
        fetchOrder(orderNumber);
      }
    });

    return () => {
      socket.off('order_status_updated');
      socket.off('order_items_added');
    };
  }, [orderNumber]);

  useEffect(() => {
    let interval;
    if (order && order.created_at) {
      const createdTime = new Date(order.created_at).getTime();
      const updateTimer = () => {
        const now = new Date().getTime();
        const elapsedMinutes = Math.floor((now - createdTime) / 60000);
        setTimer(elapsedMinutes);
      };
      updateTimer();
      interval = setInterval(updateTimer, 60000);
    }
    return () => clearInterval(interval);
  }, [order]);

  const fetchOrder = async (orderNum) => {
    setLoading(true);
    setError(null);
    try {
      const response = await API.get(`/orders/track/${orderNum}`);
      if (response.data.success && response.data.data) {
        const orderData = response.data.data;
        setOrder(orderData);
        setEstimatedTime(orderData.estimated_remaining || 0);
        setStatusMessage(orderData.status_message || '');
        setProgress(orderData.progress_percentage || 0);
        setTimeline(orderData.timeline || []);
        setSearched(true);
      } else {
        setError('Order not found');
        setOrder(null);
      }
    } catch (err) {
      console.error('Track order error:', err);
      setError(err.response?.data?.error || 'Order not found');
      setOrder(null);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const searchByPhone = async (e) => {
    e.preventDefault();
    if (!phoneNumber.trim()) {
      setError('Please enter a phone number');
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const response = await API.get(`/orders/track-by-phone/${phoneNumber.trim()}`);
      if (response.data.success && response.data.data.length > 0) {
        setOrders(response.data.data);
        setSearched(true);
        setOrder(null);
      } else {
        setError('No orders found for this phone number');
        setOrders([]);
        setSearched(true);
      }
    } catch (err) {
      console.error('Search by phone error:', err);
      setError('Failed to find orders');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!orderNumber.trim()) {
      setError('Please enter an order number');
      return;
    }
    await fetchOrder(orderNumber.trim());
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'pending_confirmation': return <Clock className="text-yellow-500" size={32} />;
      case 'confirmed': return <CheckCircle className="text-blue-500" size={32} />;
      case 'pending': return <ChefHat className="text-indigo-500" size={32} />;
      case 'preparing': return <ChefHat className="text-orange-500" size={32} />;
      case 'ready': return <Coffee className="text-green-500" size={32} />;
      case 'completed': return <CheckCircle className="text-purple-500" size={32} />;
      case 'cancelled': return <AlertCircle className="text-red-500" size={32} />;
      default: return <Clock className="text-gray-500" size={32} />;
    }
  };

  const getStatusColor = (status) => {
    const colorMap = {
      'pending_confirmation': 'bg-yellow-500',
      'confirmed': 'bg-blue-500',
      'pending': 'bg-indigo-500',
      'preparing': 'bg-orange-500',
      'ready': 'bg-green-500',
      'completed': 'bg-purple-500',
      'cancelled': 'bg-red-500'
    };
    return colorMap[status] || 'bg-gray-500';
  };

  const getStatusText = (status) => {
    const statusMap = {
      'pending_confirmation': 'Waiting for Waiter Confirmation',
      'confirmed': 'Confirmed by Waiter',
      'pending': 'Order Received by Kitchen',
      'preparing': 'Being Prepared',
      'ready': 'Ready for Pickup',
      'completed': 'Completed - Enjoy!',
      'cancelled': 'Order Cancelled'
    };
    return statusMap[status] || status;
  };

  if (loading && !order) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading order...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Track Your Order</h1>
          <p className="text-gray-500 dark:text-gray-400">Enter your order number or phone number to see real-time status</p>
        </div>

        {/* Toggle Search Mode */}
        <div className="flex justify-center gap-4 mb-6">
          <button
            onClick={() => setSearchMode('order')}
            className={"px-6 py-2 rounded-xl font-semibold transition " + (searchMode === 'order' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400')}
          >
            By Order Number
          </button>
          <button
            onClick={() => setSearchMode('phone')}
            className={"px-6 py-2 rounded-xl font-semibold transition " + (searchMode === 'phone' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400')}
          >
            By Phone Number
          </button>
        </div>

        {/* Search Form - Order Number */}
        {searchMode === 'order' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 mb-8 border border-gray-200 dark:border-gray-700 shadow-sm">
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4">
              <input
                type="text"
                placeholder="Enter order number (e.g., QR-12345678 or ORD-12345678)"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <RefreshCw className="animate-spin" size={20} /> : <span>Track Order</span>}
              </button>
            </form>
          </div>
        )}

        {/* Search Form - Phone Number */}
        {searchMode === 'phone' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 mb-8 border border-gray-200 dark:border-gray-700 shadow-sm">
            <form onSubmit={searchByPhone} className="flex flex-col sm:flex-row gap-4">
              <input
                type="tel"
                placeholder="Enter your phone number"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <RefreshCw className="animate-spin" size={20} /> : <Search size={20} />}
                <span>Find My Orders</span>
              </button>
            </form>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500 text-sm flex items-center gap-2">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* Order List (Phone Search Results) */}
        {searchMode === 'phone' && searched && orders.length > 0 && (
          <div className="space-y-4 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Your Orders ({orders.length})
            </h3>
            {orders.map((o) => (
              <div 
                key={o.id} 
                className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:border-blue-500 transition cursor-pointer"
                onClick={() => {
                  setOrderNumber(o.order_number);
                  fetchOrder(o.order_number);
                  setSearchMode('order');
                }}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white">{o.order_number}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{o.order_source || 'Order'}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Table {o.table_number || 'N/A'} • {new Date(o.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-green-600 dark:text-green-400 font-bold">
                      {formatCurrency(o.total_amount)}
                    </p>
                    <span className={"text-xs px-2 py-1 rounded-full " + (
                      o.status === 'ready' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                      o.status === 'pending_confirmation' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                      o.status === 'preparing' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
                      'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    )}>
                      {o.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Order Details */}
        {searched && order && searchMode === 'order' && (
          <div className="space-y-6">
            {/* Order Header */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Order Number</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{order.order_number}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Source: {order.source === 'qr_menu' ? 'QR Code Order' : order.source === 'waiter' ? 'Waiter Order' : 'Regular Order'}
                  </p>
                  {order.waiter_name && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Waiter: {order.waiter_name}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Total Amount</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(order.total_amount)}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Status: <span className={"font-semibold " + getStatusColor(order.status)}>
                      {getStatusText(order.status)}
                    </span>
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              <div className={"inline-flex items-center gap-2 px-4 py-2 rounded-full " + getStatusColor(order.status) + "/20 mb-6"}>
                {getStatusIcon(order.status)}
                <span className={"font-semibold " + getStatusColor(order.status)}>
                  {getStatusText(order.status)}
                </span>
              </div>

              {/* Timer and Progress */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <Timer className="text-blue-500" size={24} />
                    <div>
                      <p className="text-gray-500 dark:text-gray-400 text-sm">Time Elapsed</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{timer} min</p>
                    </div>
                  </div>
                  {estimatedTime > 0 && order.status !== 'completed' && order.status !== 'ready' && order.status !== 'cancelled' && (
                    <div className="flex items-center gap-3">
                      <Clock className="text-orange-500" size={24} />
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Estimated Remaining</p>
                        <p className="text-2xl font-bold text-orange-500">{estimatedTime} min</p>
                      </div>
                    </div>
                  )}
                  {order.status === 'ready' && (
                    <div className="flex items-center gap-3 animate-pulse">
                      <Coffee className="text-green-500" size={24} />
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Status</p>
                        <p className="text-xl font-bold text-green-500">Ready for Pickup!</p>
                      </div>
                    </div>
                  )}
                  {order.status === 'completed' && (
                    <div className="flex items-center gap-3">
                      <CheckCircle className="text-purple-500" size={24} />
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Status</p>
                        <p className="text-xl font-bold text-purple-500">Completed!</p>
                      </div>
                    </div>
                  )}
                </div>
                
                {statusMessage && (
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg">
                    {statusMessage}
                  </p>
                )}
              </div>

              {/* Progress Bar */}
              <div className="mb-6">
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: progress + '%' }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>Placed</span>
                  <span>Confirm</span>
                  <span>Kitchen</span>
                  <span>Cooking</span>
                  <span>Ready</span>
                  <span>Done</span>
                </div>
              </div>

              {/* Timeline */}
              {timeline.length > 0 && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mb-4">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Order Timeline</h4>
                  <div className="space-y-2">
                    {timeline.map((step, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <div className={"w-3 h-3 rounded-full " + (step.completed ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600')} />
                        <div className="flex-1">
                          <p className={"text-sm " + (step.completed ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500')}>
                            {step.status}
                          </p>
                        </div>
                        {step.time && (
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {new Date(step.time).toLocaleTimeString()}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Order Items */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h3 className="text-gray-900 dark:text-white font-semibold mb-3 flex items-center gap-2">
                  <ShoppingBag size={18} className="text-blue-500" />
                  Order Items
                </h3>
                <div className="space-y-2">
                  {order.items && order.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                      <div className="flex-1">
                        <p className="text-gray-900 dark:text-white font-medium">
                          <span className="text-blue-500">{item.quantity}x</span> {item.product_name}
                        </p>
                        {item.category && (
                          <p className="text-xs text-gray-400 dark:text-gray-500">{item.category}</p>
                        )}
                      </div>
                      <p className="text-gray-900 dark:text-white font-bold">{formatCurrency(item.total_price || item.unit_price * item.quantity)}</p>
                    </div>
                  ))}
                </div>
                
                {/* Price Breakdown */}
                <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
                    <span className="text-gray-900 dark:text-white">{formatCurrency(order.total_amount * 0.87)}</span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-gray-500 dark:text-gray-400">VAT (15%)</span>
                    <span className="text-gray-900 dark:text-white">{formatCurrency(order.total_amount * 0.13)}</span>
                  </div>
                  <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-gray-900 dark:text-white font-bold text-lg">Total</span>
                    <span className="text-green-600 dark:text-green-400 font-bold text-xl">{formatCurrency(order.total_amount)}</span>
                  </div>
                </div>
              </div>

              {/* Customer Info */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <User size={16} className="text-gray-400" />
                    <div>
                      <p className="text-gray-500 dark:text-gray-400 text-xs">Customer</p>
                      <p className="text-gray-900 dark:text-white font-medium">{order.customer_name || 'Walk-in Customer'}</p>
                    </div>
                  </div>
                  {order.customer_phone && (
                    <div className="flex items-center gap-2">
                      <Phone size={16} className="text-gray-400" />
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs">Phone</p>
                        <p className="text-gray-900 dark:text-white font-medium">{order.customer_phone}</p>
                      </div>
                    </div>
                  )}
                  {order.table_number && (
                    <div className="flex items-center gap-2">
                      <MapPin size={16} className="text-gray-400" />
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs">Table</p>
                        <p className="text-gray-900 dark:text-white font-medium">Table {order.table_number}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-gray-400" />
                    <div>
                      <p className="text-gray-500 dark:text-gray-400 text-xs">Ordered At</p>
                      <p className="text-gray-900 dark:text-white font-medium">{formatDate(order.created_at)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Special Instructions */}
            {order.notes && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Special Instructions</h3>
                <p className="text-gray-600 dark:text-gray-300 italic">"{order.notes}"</p>
              </div>
            )}

            {/* Help Section */}
            <div className="bg-blue-500/10 rounded-2xl p-4 border border-blue-500/30 text-center">
              <p className="text-blue-600 dark:text-blue-400 text-sm">
                💡 Need help? Call the restaurant or ask your waiter
              </p>
            </div>
          </div>
        )}

        {/* No Order Found */}
        {searched && !order && !loading && orders.length === 0 && searchMode === 'order' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center border border-gray-200 dark:border-gray-700">
            <AlertCircle size={48} className="mx-auto text-gray-400 mb-3" />
            <p className="text-gray-600 text-lg">Order Not Found</p>
            <p className="text-gray-500 text-sm mt-1">Please check your order number and try again</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrackOrder;
