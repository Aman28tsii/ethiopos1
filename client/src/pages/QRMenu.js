// client/src/pages/QRMenu.js
import React, { useState, useEffect } from 'react';
import API from '../api/axios';
import { 
  ShoppingCart, Plus, Minus, X, Utensils, Phone, MapPin, Clock, 
  Trash2, CheckCircle, AlertCircle, ChefHat, Truck, Coffee
} from 'lucide-react';
import socket from '../socket';
import { useLanguage } from '../context/LanguageContext';
import { formatCurrency, getProductEmoji } from '../utils/formatting';
import { generateIdempotencyKey } from '../services/orderService';

const QRMenu = () => {
  const { t } = useLanguage();
  
  const [tableId, setTableId] = useState(null);
  const [tableNumber, setTableNumber] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [orderStatus, setOrderStatus] = useState(null);
  const [orderNumber, setOrderNumber] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showQRGuide, setShowQRGuide] = useState(false);
  const [showOrderTracking, setShowOrderTracking] = useState(false);
  const [trackingOrder, setTrackingOrder] = useState(null);
  const [timer, setTimer] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(20);
  const [priceUpdate, setPriceUpdate] = useState(null);
  const [isAddingMoreItems, setIsAddingMoreItems] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [restaurantInfo, setRestaurantInfo] = useState({
    name: 'EthioPOS Restaurant',
    address: 'Addis Ababa, Ethiopia',
    phone: '+251-XXX-XXX-XXX',
    hours: '9:00 AM - 10:00 PM'
  });

  const getOrderStorageKey = function() { return 'qr_order_table_' + tableId; };
  const getContinueOrderKey = function() { return 'continue_order_' + tableId; };

  const getStatusText = function(status) {
    const statusMap = {
      'pending_confirmation': 'Waiting for Waiter',
      'confirmed': 'Confirmed by Waiter',
      'pending': 'Order Received by Kitchen',
      'preparing': 'Being Prepared',
      'ready': 'Ready for Pickup',
      'completed': 'Completed - Enjoy'
    };
    return statusMap[status] || status;
  };

  const getProgressPercent = function(status) {
    const percentMap = {
      'pending_confirmation': 10,
      'confirmed': 25,
      'pending': 40,
      'preparing': 60,
      'ready': 85,
      'completed': 100
    };
    return percentMap[status] || 0;
  };

  const getStatusIcon = function(status) {
    switch(status) {
      case 'pending_confirmation': return React.createElement(Clock, { size: 24, className: 'text-yellow-500' });
      case 'confirmed': return React.createElement(CheckCircle, { size: 24, className: 'text-blue-500' });
      case 'pending': return React.createElement(Clock, { size: 24, className: 'text-indigo-500' });
      case 'preparing': return React.createElement(ChefHat, { size: 24, className: 'text-orange-500' });
      case 'ready': return React.createElement(Coffee, { size: 24, className: 'text-green-500' });
      case 'completed': return React.createElement(Truck, { size: 24, className: 'text-purple-500' });
      default: return React.createElement(Clock, { size: 24, className: 'text-gray-500' });
    }
  };

  // Save order to localStorage
  const saveOrderToStorage = function(order) {
    if (order && order.order_number) {
      localStorage.setItem(getOrderStorageKey(), JSON.stringify({
        order_id: order.order_id,
        order_number: order.order_number,
        total_amount: order.total_amount,
        status: order.status,
        placed_at: order.placed_at || new Date().toISOString(),
        customer_name: customerName,
        customer_phone: customerPhone
      }));
    }
  };

  // Check for continuing order
  const checkForContinuingOrder = function() {
    const continueOrderNum = localStorage.getItem(getContinueOrderKey());
    if (continueOrderNum && !orderPlaced) {
      if (window.confirm('Continue previous order?')) {
        setOrderNumber(continueOrderNum);
        fetchOrderDetails(continueOrderNum);
        localStorage.removeItem(getContinueOrderKey());
        return true;
      } else {
        localStorage.removeItem(getContinueOrderKey());
      }
    }
    return false;
  };

  // Load saved order
  const loadSavedOrder = function() {
    const saved = localStorage.getItem(getOrderStorageKey());
    if (saved) {
      try {
        const order = JSON.parse(saved);
        setCurrentOrder(order);
        setOrderNumber(order.order_number);
        setOrderStatus(order.status);
        setOrderPlaced(true);
        startStatusPolling(order.order_number);
        return true;
      } catch (e) {
        console.error('Error loading saved order:', e);
      }
    }
    return false;
  };

  // Fetch order details
  const fetchOrderDetails = async function(orderNum) {
    try {
      const response = await API.get('/orders/track/' + orderNum);
      if (response.data.success && response.data.data) {
        const orderData = response.data.data;
        setCurrentOrder({
          order_id: orderData.id,
          order_number: orderData.order_number,
          total_amount: orderData.total_amount,
          status: orderData.status,
          placed_at: orderData.created_at
        });
        setOrderStatus(orderData.status);
        setOrderPlaced(true);
        startStatusPolling(orderData.order_number);
        if (orderData.status_message) {
          setStatusMessage(orderData.status_message);
        }
      }
    } catch (err) {
      console.error('Fetch order details error:', err);
    }
  };

  // Start polling
  const startStatusPolling = function(orderNum) {
    const interval = setInterval(async function() {
      try {
        const response = await API.get('/orders/track/' + orderNum);
        if (response.data.success && response.data.data) {
          const newStatus = response.data.data.status;
          setOrderStatus(newStatus);
          if (currentOrder) {
            const updated = { ...currentOrder, status: newStatus };
            setCurrentOrder(updated);
            saveOrderToStorage(updated);
          }
          if (newStatus === 'completed') {
            clearInterval(interval);
          }
        }
      } catch (err) {}
    }, 10000);
    return interval;
  };

  // Clear saved order
  const clearSavedOrder = function() {
    localStorage.removeItem(getOrderStorageKey());
    localStorage.removeItem(getContinueOrderKey());
    setOrderPlaced(false);
    setCurrentOrder(null);
    setOrderNumber(null);
    setOrderStatus(null);
    setTrackingOrder(null);
    setIsAddingMoreItems(false);
    window.location.reload();
  };

  // Start adding more items
  const startAddingMoreItems = function() {
    if (orderNumber) {
      localStorage.setItem(getContinueOrderKey(), orderNumber);
    }
    setIsAddingMoreItems(true);
    setOrderPlaced(false);
    setCart([]);
  };

  // Finish adding more items
  const finishAddingMoreItems = async function() {
    if (cart.length > 0) {
      await addMoreItemsToExistingOrder();
    } else {
      setIsAddingMoreItems(false);
      if (orderNumber) {
        await fetchOrderDetails(orderNumber);
      }
    }
  };

  // ✅ FIX: Add More Items with Idempotency Key
  const addMoreItemsToExistingOrder = async function() {
    if (cart.length === 0) {
      alert(t('pleaseAddItems'));
      return;
    }

    setLoading(true);
    try {
      const orderData = {
        order_id: currentOrder.order_id,
        items: cart.map(function(item) { return { product_id: item.id, quantity: item.quantity }; })
      };
      
      // ✅ Generate idempotency key for add items
      const idempotencyKey = generateIdempotencyKey(orderData);

      const response = await API.post('/orders/' + currentOrder.order_id + '/customer-add-items', {
        items: cart.map(function(item) { return { product_id: item.id, quantity: item.quantity }; })
      }, {
        headers: {
          'Idempotency-Key': idempotencyKey
        }
      });

      if (response.data.success) {
        alert('Items added to order! New Total: ' + formatCurrency(response.data.new_total));
        setCart([]);
        setShowCart(false);
        await fetchOrderDetails(currentOrder.order_number);
        setIsAddingMoreItems(false);
      }
    } catch (err) {
      console.error('Add items error:', err);
      alert(err.response?.data?.error || 'Failed to add items');
    } finally {
      setLoading(false);
    }
  };

  // Data fetching
  const fetchProducts = async function() {
    setLoading(true);
    setError(null);
    try {
      const response = await API.get('/products');
      const productsData = response.data.data || [];
      if (productsData.length === 0) {
        setError('No menu items available');
      } else {
        setProducts(productsData);
        const uniqueCategories = ['all'].concat(productsData.filter(function(p) { return p.category; }).map(function(p) { return p.category; }));
        setCategories(uniqueCategories);
      }
    } catch (err) {
      setError('Unable to load menu');
    } finally {
      setLoading(false);
    }
  };

  const loadRestaurantInfo = function() {
    const saved = localStorage.getItem('restaurantSettings');
    if (saved) setRestaurantInfo(JSON.parse(saved));
  };

  // Cart operations
  const addToCart = function(product) {
    const price = typeof product.price === 'string' ? parseFloat(product.price) : product.price;
    setCart(function(prev) {
      const existing = prev.find(function(item) { return item.id === product.id; });
      if (existing) {
        setPriceUpdate(product.id);
        setTimeout(function() { setPriceUpdate(null); }, 300);
        return prev.map(function(item) {
          if (item.id === product.id) {
            return { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * price };
          }
          return item;
        });
      }
      setPriceUpdate(product.id);
      setTimeout(function() { setPriceUpdate(null); }, 300);
      return prev.concat([{ id: product.id, name: product.name, price: price, quantity: 1, total: price }]);
    });
  };

  const updateQuantity = function(productId, delta) {
    setCart(function(prev) {
      const item = prev.find(function(i) { return i.id === productId; });
      if (!item) return prev;
      const newQty = item.quantity + delta;
      if (newQty <= 0) return prev.filter(function(i) { return i.id !== productId; });
      setPriceUpdate(productId);
      setTimeout(function() { setPriceUpdate(null); }, 300);
      return prev.map(function(i) {
        if (i.id === productId) {
          return { ...i, quantity: newQty, total: newQty * i.price };
        }
        return i;
      });
    });
  };

  const removeFromCart = function(productId) {
    setCart(function(prev) { return prev.filter(function(item) { return item.id !== productId; }); });
  };

  // ✅ FIX: Place Order with Idempotency Key
  const placeOrder = async function() {
    if (cart.length === 0) {
      alert(t('pleaseAddItems'));
      return;
    }

    setLoading(true);
    try {
      const orderData = {
        items: cart.map(function(item) { return { product_id: item.id, quantity: item.quantity }; }),
        table_id: tableId,
        customer_name: customerName.trim() || 'Walk-in Customer',
        customer_phone: customerPhone || null,
        notes: specialInstructions,
        order_type: 'dine_in',
        source: 'qr_menu'
      };

      // ✅ Generate unique idempotency key
      const idempotencyKey = generateIdempotencyKey(orderData);

      const response = await API.post('/orders/qr-order', orderData, {
        headers: {
          'Idempotency-Key': idempotencyKey
        }
      });
      
      if (response.data.success) {
        const data = response.data.data;
        const newOrder = {
          order_id: data.order_id,
          order_number: data.order_number,
          total_amount: data.total_amount,
          status: data.status,
          placed_at: new Date().toISOString()
        };
        setCurrentOrder(newOrder);
        setOrderNumber(data.order_number);
        setOrderStatus(data.status);
        setOrderPlaced(true);
        setCart([]);
        saveOrderToStorage(newOrder);
        startStatusPolling(data.order_number);
        setStatusMessage('Order placed! Waiting for confirmation.');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  // Timer effect
  useEffect(function() {
    let interval;
    if (currentOrder && currentOrder.placed_at) {
      const startTime = new Date(currentOrder.placed_at).getTime();
      interval = setInterval(function() {
        const elapsed = Math.floor((new Date().getTime() - startTime) / 60000);
        setTimer(elapsed);
      }, 60000);
    }
    return function() { clearInterval(interval); };
  }, [currentOrder]);

  // Calculate estimated time
  const calculateEstimatedTime = function(orderData) {
    if (orderData.status === 'pending_confirmation') {
      setEstimatedTime(5);
      return;
    }
    const baseTime = 15;
    const itemCount = orderData.items?.length || 1;
    const additionalTime = Math.min(itemCount * 3, 15);
    let totalTime = baseTime + additionalTime;
    if (orderData.status === 'preparing') {
      totalTime = Math.max(5, totalTime - 5);
    } else if (orderData.status === 'ready' || orderData.status === 'completed') {
      totalTime = 0;
    }
    setEstimatedTime(totalTime);
  };

  // Socket listeners
  useEffect(function() {
    socket.on('order_status_updated', function(data) {
      if (currentOrder && data.order_id === currentOrder.order_id) {
        setOrderStatus(data.status);
        const updated = { ...currentOrder, status: data.status };
        setCurrentOrder(updated);
        saveOrderToStorage(updated);
        
        const statusMessages = {
          'confirmed': 'Order confirmed by waiter! Kitchen will prepare soon.',
          'pending': 'Kitchen has received your order!',
          'preparing': 'Your food is being cooked!',
          'ready': 'Your order is ready for pickup!',
          'completed': 'Order completed. Enjoy your meal!'
        };
        
        if (statusMessages[data.status]) {
          setStatusMessage(statusMessages[data.status]);
          if (data.status === 'ready' || data.status === 'completed') {
            alert(statusMessages[data.status]);
          }
        }
      }
    });

    socket.on('order_ready_for_customer', function(data) {
      if (currentOrder && data.order_id === currentOrder.order_id) {
        setOrderStatus('ready');
        setStatusMessage('Your order is ready for pickup!');
        alert('Your order is ready for pickup!');
      }
    });

    socket.on('order_items_added', function(data) {
      if (currentOrder && data.order_id === currentOrder.order_id) {
        setStatusMessage('Items added! New total: ' + formatCurrency(data.new_total));
        if (orderNumber) {
          fetchOrderDetails(orderNumber);
        }
      }
    });

    socket.on('order_completed', function(data) {
      if (currentOrder && data.order_id === currentOrder.order_id) {
        setOrderStatus('completed');
        setStatusMessage('Order completed! Thank you for dining with us!');
        alert('Order completed! Thank you for dining with us!');
      }
    });

    socket.on('order_confirmed', function(data) {
      if (currentOrder && data.order_id === currentOrder.order_id) {
        setOrderStatus('pending');
        setStatusMessage('Order confirmed! Kitchen is preparing your food.');
      }
    });

    return function() {
      socket.off('order_status_updated');
      socket.off('order_ready_for_customer');
      socket.off('order_items_added');
      socket.off('order_completed');
      socket.off('order_confirmed');
    };
  }, [currentOrder, orderNumber]);

  // Initialization
  useEffect(function() {
    const params = new URLSearchParams(window.location.search);
    const table = params.get('table');
    if (table) {
      setTableId(table);
      setTableNumber(table);
    }
    fetchProducts();
    loadRestaurantInfo();
    
    setTimeout(function() {
      if (tableId) {
        const loaded = loadSavedOrder();
        if (!loaded) {
          checkForContinuingOrder();
        }
      }
    }, 100);
  }, [tableId]);

  // Render helpers
  const subtotal = cart.reduce(function(sum, item) { return sum + item.total; }, 0);
  const tax = subtotal * 0.15;
  const total = subtotal + tax;
  const filteredProducts = selectedCategory === 'all' ? products : products.filter(function(p) { return p.category === selectedCategory; });

  // Order Tracking Modal
  if (showOrderTracking && trackingOrder) {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
          <div className="sticky top-0 bg-white dark:bg-gray-800 p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Track Your Order</h2>
            <button onClick={function() { setShowOrderTracking(false); }} className="text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:text-gray-300"><X size={24} /></button>
          </div>
          <div className="p-4 space-y-4">
            {statusMessage && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-blue-700 dark:text-blue-400 text-sm text-center">
                {statusMessage}
              </div>
            )}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
              <p className="text-gray-500 dark:text-gray-400 text-sm">Order Number</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{trackingOrder.order_number}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
              <div className="flex justify-between mb-2">
                <span className="text-gray-500 dark:text-gray-400">Status</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">{getStatusText(trackingOrder.status)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Total Amount</span>
                <span className="text-green-600 dark:text-green-400 font-bold">{formatCurrency(trackingOrder.total_amount)}</span>
              </div>
              {trackingOrder.waiter_name && (
                <div className="flex justify-between mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                  <span className="text-gray-500 dark:text-gray-400">Waiter</span>
                  <span className="text-gray-900 dark:text-white">{trackingOrder.waiter_name}</span>
                </div>
              )}
              {trackingOrder.order_source && (
                <div className="flex justify-between mt-1">
                  <span className="text-gray-500 dark:text-gray-400">Order Source</span>
                  <span className="text-gray-900 dark:text-white">{trackingOrder.order_source}</span>
                </div>
              )}
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
              <div className="flex justify-between mb-3">
                <span className="text-gray-500 dark:text-gray-400">Time Elapsed</span>
                <span className="text-gray-900 dark:text-white font-bold">{timer} min</span>
              </div>
              {estimatedTime > 0 && trackingOrder.status !== 'completed' && trackingOrder.status !== 'ready' && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Estimated Remaining</span>
                  <span className="text-orange-600 dark:text-orange-400 font-bold">{estimatedTime} min</span>
                </div>
              )}
              {trackingOrder.status === 'ready' && (
                <div className="text-center text-green-600 dark:text-green-400 font-semibold animate-pulse">Ready for Pickup</div>
              )}
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">Order Items:</p>
              {trackingOrder.items && trackingOrder.items.map(function(item, idx) {
                return (
                  <div key={idx} className="flex justify-between text-sm py-1">
                    <span className="text-gray-700 dark:text-gray-300">{item.quantity}x {item.product_name}</span>
                    <span className="text-gray-900 dark:text-white">{formatCurrency(item.total_price)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Adding More Items Screen
  if (isAddingMoreItems) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="sticky top-0 bg-yellow-100 dark:bg-yellow-900/20 backdrop-blur-sm p-3 text-center border-b border-yellow-200 dark:border-yellow-800">
          <p className="text-yellow-700 dark:text-yellow-400 text-sm">
            Adding More Items to Order #{orderNumber}
          </p>
        </div>
        
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Add More Items</h2>
            <button
              onClick={finishAddingMoreItems}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold"
            >
              Done - Return to Order
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 py-2 px-4 flex overflow-x-auto gap-4 text-sm text-gray-600 dark:text-gray-300">
          <div className="flex items-center gap-1"><MapPin size={14} /><span>{restaurantInfo.address}</span></div>
          <div className="flex items-center gap-1"><Phone size={14} /><span>{restaurantInfo.phone}</span></div>
          <div className="flex items-center gap-1"><Clock size={14} /><span>{restaurantInfo.hours}</span></div>
        </div>

        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-[72px] z-20">
          <div className="container mx-auto px-4">
            <div className="flex overflow-x-auto gap-2 py-3">
              {categories.map(function(cat) {
                return (
                  <button key={cat} onClick={function() { setSelectedCategory(cat); }} className={"px-4 py-2 rounded-full text-sm font-semibold transition whitespace-nowrap " + (selectedCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300')}>
                    {cat === 'all' ? 'All Items' : cat}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-6 pb-32">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map(function(product) {
              return (
                <div key={product.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:border-blue-500/50 transition shadow-sm hover:shadow-md">
                  <div className="p-4">
                    <div className="flex gap-3">
                      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center text-3xl">
                        {getProductEmoji(product.category)}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{product.name}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{product.description || 'Delicious Ethiopian dish'}</p>
                        <p className="text-blue-600 dark:text-blue-400 font-bold mt-2">{formatCurrency(product.price)}</p>
                      </div>
                      <button 
                        onClick={function() { addToCart(product); }} 
                        className="w-10 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center transition transform hover:scale-105"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {showCart && (
          <>
            <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-40" onClick={function() { setShowCart(false); }} />
            <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl z-50 flex flex-col">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gradient-to-r from-blue-600 to-purple-600">
                <h2 className="text-xl font-bold text-white">Items to Add</h2>
                <button onClick={function() { setShowCart(false); }} className="text-white"><X size={24} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {cart.length === 0 ? (
                  <div className="text-center py-12">
                    <ShoppingCart size={48} className="mx-auto text-gray-500 dark:text-gray-600 mb-3" />
                    <p className="text-gray-500 dark:text-gray-400">No items to add</p>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Tap products to add</p>
                  </div>
                ) : (
                  cart.map(function(item) {
                    return (
                      <div key={item.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-3">
                        <div className="flex justify-between">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{item.name}</p>
                            <p className={"text-blue-600 dark:text-blue-400 text-sm " + (priceUpdate === item.id ? 'animate-pulse' : '')}>{formatCurrency(item.price)}</p>
                          </div>
                          <button onClick={function() { removeFromCart(item.id); }} className="text-red-500 dark:text-red-400"><Trash2 size={16} /></button>
                        </div>
                        <div className="flex justify-between items-center mt-2">
                          <div className="flex items-center gap-3">
                            <button onClick={function() { updateQuantity(item.id, -1); }} className="w-8 h-8 bg-gray-200 dark:bg-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500">-</button>
                            <span className="text-gray-900 dark:text-white w-6 text-center">{item.quantity}</span>
                            <button onClick={function() { updateQuantity(item.id, 1); }} className="w-8 h-8 bg-gray-200 dark:bg-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500">+</button>
                          </div>
                          <span className={"font-bold text-gray-900 dark:text-white " + (priceUpdate === item.id ? 'animate-pulse' : '')}>{formatCurrency(item.total)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>Subtotal to Add</span><span>{formatCurrency(subtotal)}</span></div>
                  <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>VAT (15%)</span><span>{formatCurrency(tax)}</span></div>
                  <div className="flex justify-between text-gray-900 dark:text-white font-bold text-lg pt-2 border-t border-gray-200 dark:border-gray-700"><span>Total to Add</span><span className="text-green-600 dark:text-green-400">{formatCurrency(total)}</span></div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={addMoreItemsToExistingOrder}
                    disabled={cart.length === 0 || loading}
                    className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition disabled:opacity-50"
                  >
                    {loading ? 'Adding...' : 'Add to Order'}
                  </button>
                  <button
                    onClick={function() { setShowCart(false); }} className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-semibold"
                  >
                    Continue Shopping
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {cart.length > 0 && !showCart && (
          <button onClick={function() { setShowCart(true); }} className="fixed bottom-6 right-6 bg-green-600 hover:bg-green-700 text-white rounded-full p-4 shadow-lg transition transform hover:scale-105 z-40">
            <div className="relative">
              <ShoppingCart size={24} />
              <span className="absolute -top-2 -right-2 bg-yellow-400 text-blue-900 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {cart.reduce(function(s, i) { return s + i.quantity; }, 0)}
              </span>
            </div>
          </button>
        )}
      </div>
    );
  }

  // Order Placed Screen
  if (orderPlaced && currentOrder) {
    const progress = getProgressPercent(orderStatus || currentOrder.status);
    const statusText = getStatusText(orderStatus || currentOrder.status);
    const isCompleted = orderStatus === 'completed';
    const canAddMore = orderStatus === 'pending_confirmation' || orderStatus === 'confirmed' || orderStatus === 'pending';
    
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 mb-6 shadow-lg">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-3">
                {getStatusIcon(orderStatus || currentOrder.status)}
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Your Order Status</h2>
              <p className="text-sm mt-1 font-semibold text-blue-600 dark:text-blue-400">{statusText}</p>
              {statusMessage && (
                <p className="text-sm mt-2 text-gray-600 dark:text-gray-300">{statusMessage}</p>
              )}
            </div>

            <div className="mb-6">
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500" style={{ width: progress + '%' }} />
              </div>
              <div className="flex justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
                <span>Placed</span><span>Confirm</span><span>Kitchen</span><span>Cooking</span><span>Ready</span><span>Done</span>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-4">
              <div className="flex justify-between mb-2">
                <span className="text-gray-500 dark:text-gray-400">Order Number</span>
                <span className="text-gray-900 dark:text-white font-bold">{currentOrder.order_number}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-gray-500 dark:text-gray-400">Time Elapsed</span>
                <span className="text-gray-900 dark:text-white">{timer} minutes</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Total Amount</span>
                <span className="text-green-600 dark:text-green-400 font-bold">{formatCurrency(currentOrder.total_amount)}</span>
              </div>
              {customerName && (
                <div className="flex justify-between mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                  <span className="text-gray-500 dark:text-gray-400">Customer</span>
                  <span className="text-gray-900 dark:text-white">{customerName}</span>
                </div>
              )}
              {currentOrder.waiter_name && (
                <div className="flex justify-between mt-1">
                  <span className="text-gray-500 dark:text-gray-400">Waiter</span>
                  <span className="text-gray-900 dark:text-white">{currentOrder.waiter_name}</span>
                </div>
              )}
              {currentOrder.order_source && (
                <div className="flex justify-between mt-1">
                  <span className="text-gray-500 dark:text-gray-400">Order Source</span>
                  <span className="text-gray-900 dark:text-white">{currentOrder.order_source}</span>
                </div>
              )}
            </div>

            {!isCompleted && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-3 mb-4 text-center">
                <p className="text-yellow-700 dark:text-yellow-400 text-sm">
                  Order saved - you can refresh the page
                </p>
              </div>
            )}

            {isCompleted && (
              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 mb-4 text-center">
                <p className="text-green-700 dark:text-green-400 text-sm">Order completed! Thank you for dining with us!</p>
              </div>
            )}

            <div className="flex gap-3">
              <button 
                onClick={function() {
                  setTrackingOrder(currentOrder);
                  setShowOrderTracking(true);
                }} 
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold"
              >
                Track Order
              </button>
              
              {canAddMore && (
                <button 
                  onClick={startAddingMoreItems}
                  className="flex-1 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-xl font-semibold"
                >
                  + Add More Items
                </button>
              )}
              
              {isCompleted && (
                <button 
                  onClick={clearSavedOrder} 
                  className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold"
                >
                  Start New Order
                </button>
              )}
            </div>
          </div>

          <div className="text-center text-gray-500 dark:text-gray-400 text-sm">
            <p>Need help? {restaurantInfo.phone}</p>
          </div>
        </div>
      </div>
    );
  }

  // Loading Screen
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading menu...</p>
        </div>
      </div>
    );
  }

  // Error Screen
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-8 text-center border border-gray-200 dark:border-gray-700">
          <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Error</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">{error}</p>
          <button onClick={fetchProducts} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold">Try Again</button>
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-8 text-center border border-gray-200 dark:border-gray-700">
          <Utensils size={48} className="text-gray-500 dark:text-gray-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Menu Empty</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">No menu items available</p>
        </div>
      </div>
    );
  }

  // Main Menu Screen
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-gradient-to-r from-blue-600 to-purple-600 text-white sticky top-0 z-30 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold">{restaurantInfo.name}</h1>
              <p className="text-xs text-blue-100">Table {tableNumber || 'Guest'}</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={function() { setShowQRGuide(!showQRGuide); }} className="bg-white/20 rounded-full p-2 hover:bg-white/30 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </button>
              <button onClick={function() { setShowCart(true); }} className="relative bg-white/20 rounded-full p-2 hover:bg-white/30 transition">
                <ShoppingCart size={24} />
                {cart.length > 0 && (
                  <span className="absolute -top-2 -right-2 bg-yellow-400 text-blue-900 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {cart.reduce(function(s, i) { return s + i.quantity; }, 0)}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* QR Guide Modal */}
      {showQRGuide && (
        <>
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-40" onClick={function() { setShowQRGuide(false); }} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-sm w-full p-6 text-center border border-gray-200 dark:border-gray-700">
              <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">How QR Ordering Works</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">1. Scan QR code at your table<br />2. Browse menu and add items<br />3. Enter your details<br />4. Place order - waiter confirms</p>
              <button onClick={function() { setShowQRGuide(false); }} className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold">Got It</button>
            </div>
          </div>
        </>
      )}

      {/* Restaurant Info Bar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 py-2 px-4 flex overflow-x-auto gap-4 text-sm text-gray-600 dark:text-gray-300">
        <div className="flex items-center gap-1"><MapPin size={14} /><span>{restaurantInfo.address}</span></div>
        <div className="flex items-center gap-1"><Phone size={14} /><span>{restaurantInfo.phone}</span></div>
        <div className="flex items-center gap-1"><Clock size={14} /><span>{restaurantInfo.hours}</span></div>
      </div>

      {/* Categories */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-[72px] z-20">
        <div className="container mx-auto px-4">
          <div className="flex overflow-x-auto gap-2 py-3">
            {categories.map(function(cat) {
              return (
                <button key={cat} onClick={function() { setSelectedCategory(cat); }} className={"px-4 py-2 rounded-full text-sm font-semibold transition whitespace-nowrap " + (selectedCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300')}>
                  {cat === 'all' ? 'All Items' : cat}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <div className="container mx-auto px-4 py-6 pb-32">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map(function(product) {
            return (
              <div key={product.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:border-blue-500/50 transition shadow-sm hover:shadow-md">
                <div className="p-4">
                  <div className="flex gap-3">
                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center text-3xl">
                      {getProductEmoji(product.category)}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{product.name}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{product.description || 'Delicious Ethiopian dish'}</p>
                      <p className="text-blue-600 dark:text-blue-400 font-bold mt-2">{formatCurrency(product.price)}</p>
                    </div>
                    <button 
                      onClick={function() { addToCart(product); }} 
                      className="w-10 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center transition transform hover:scale-105"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Cart Button */}
      {cart.length > 0 && !showCart && (
        <button onClick={function() { setShowCart(true); }} className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg transition transform hover:scale-105 z-40">
          <div className="relative">
            <ShoppingCart size={24} />
            <span className="absolute -top-2 -right-2 bg-yellow-400 text-blue-900 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {cart.reduce(function(s, i) { return s + i.quantity; }, 0)}
            </span>
          </div>
        </button>
      )}

      {/* Cart Sidebar */}
      {showCart && (
        <>
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-40" onClick={function() { setShowCart(false); }} />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl z-50 flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gradient-to-r from-blue-600 to-purple-600">
              <h2 className="text-xl font-bold text-white">Your Order</h2>
              <button onClick={function() { setShowCart(false); }} className="text-white"><X size={24} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {cart.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingCart size={48} className="mx-auto text-gray-500 dark:text-gray-600 mb-3" />
                  <p className="text-gray-500 dark:text-gray-400">Your cart is empty</p>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Tap items to add</p>
                </div>
              ) : (
                cart.map(function(item) {
                  return (
                    <div key={item.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-3">
                      <div className="flex justify-between">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{item.name}</p>
                          <p className={"text-blue-600 dark:text-blue-400 text-sm " + (priceUpdate === item.id ? 'animate-pulse' : '')}>{formatCurrency(item.price)}</p>
                        </div>
                        <button onClick={function() { removeFromCart(item.id); }} className="text-red-500 dark:text-red-400"><Trash2 size={16} /></button>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <div className="flex items-center gap-3">
                          <button onClick={function() { updateQuantity(item.id, -1); }} className="w-8 h-8 bg-gray-200 dark:bg-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500">-</button>
                          <span className="text-gray-900 dark:text-white w-6 text-center">{item.quantity}</span>
                          <button onClick={function() { updateQuantity(item.id, 1); }} className="w-8 h-8 bg-gray-200 dark:bg-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500">+</button>
                        </div>
                        <span className={"font-bold text-gray-900 dark:text-white " + (priceUpdate === item.id ? 'animate-pulse' : '')}>{formatCurrency(item.total)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 p-4">
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>VAT (15%)</span><span>{formatCurrency(tax)}</span></div>
                <div className="flex justify-between text-gray-900 dark:text-white font-bold text-lg pt-2 border-t border-gray-200 dark:border-gray-700"><span>Total</span><span className="text-green-600 dark:text-green-400">{formatCurrency(total)}</span></div>
              </div>
              <input type="text" placeholder="Your name (optional)" value={customerName} onChange={function(e) { setCustomerName(e.target.value); }} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg mb-2 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
              <input type="tel" placeholder="Your phone (optional)" value={customerPhone} onChange={function(e) { setCustomerPhone(e.target.value); }} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg mb-2 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
              <textarea placeholder="Special instructions" value={specialInstructions} onChange={function(e) { setSpecialInstructions(e.target.value); }} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg mb-4 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" rows={2} />
              
              {/* ✅ FIX: placeOrder now includes idempotency key */}
              <button onClick={placeOrder} disabled={cart.length === 0 || loading} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition">
                {loading ? 'Placing Order...' : 'Place Order'}
              </button>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-3">Waiter will confirm your order</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default QRMenu;