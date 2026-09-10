import React, { useState, useEffect, useRef } from 'react';
import API from '../../api/axios';
import { 
    ShoppingCart, Trash2, CheckCircle, Search,
    CreditCard, Smartphone, DollarSign, User, Phone, Send,
    Plus, Minus
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

// ============================================
// HELPER FUNCTIONS
// ============================================
const getProductEmoji = (category) => {
    const emojis = {
        'Main Course': '🍛',
        'Beverage': '🥤',
        'Drink': '🥤',
        'Juice': '🧃',
        'Coffee': '☕',
        'Tea': '🍵',
        'Dessert': '🍰',
        'Appetizer': '🍢',
        'Soup': '🍲',
        'Salad': '🥗',
        'Breakfast': '🍳',
        'Traditional': '🇪🇹',
        'Ethiopian': '🇪🇹',
        'Side': '🥗',
        'Main Dish': '🍛',
        'Vegetarian': '🥬',
        'Bread': '🍞'
    };
    return emojis[category] || '🍽️';
};

const formatCurrency = (value) => {
    return `Br ${parseFloat(value || 0).toFixed(2)}`;
};

// ✅ Generate a unique idempotency key (UUID v4 style, no dependency needed)
const generateIdempotencyKey = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};

// ============================================
// MAIN COMPONENT
// ============================================
const ManualOrder = () => {
    const { t } = useLanguage();
    
    // ============================================
    // STATE
    // ============================================
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [cart, setCart] = useState([]);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [specialInstructions, setSpecialInstructions] = useState('');
    const [tables, setTables] = useState([]);
    const [selectedTableId, setSelectedTableId] = useState('');
    const [orderType, setOrderType] = useState('dine_in');
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [processing, setProcessing] = useState(false);
    const [orderComplete, setOrderComplete] = useState(false);
    const [orderNumber, setOrderNumber] = useState(null);
    const [completedTotal, setCompletedTotal] = useState(0); // ✅ NEW
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [orderError, setOrderError] = useState(null);

    // ✅ Holds the idempotency key for the CURRENT order attempt.
    // Reused across retries of the same order, regenerated for a new order.
    const idempotencyKeyRef = useRef(generateIdempotencyKey());

    // ============================================
    // FETCH DATA
    // ============================================
    useEffect(() => {
        fetchProducts();
        fetchTables();
    }, []);

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const response = await API.get('/products');
            const productsData = response.data.data || [];
            setProducts(productsData);
            const uniqueCategories = ['all', ...new Set(productsData.map(p => p.category).filter(Boolean))];
            setCategories(uniqueCategories);
        } catch (err) {
            console.error('Fetch products error:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchTables = async () => {
        try {
            const response = await API.get('/tables');
            setTables(response.data.data || []);
        } catch (err) {
            console.error('Fetch tables error:', err);
        }
    };

    // ============================================
    // CART OPERATIONS
    // ============================================
    const addToCart = (product) => {
        const price = typeof product.price === 'string' ? parseFloat(product.price) : product.price;
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item =>
                    item.id === product.id
                        ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * price }
                        : item
                );
            }
            return [...prev, {
                id: product.id,
                name: product.name,
                price: price,
                quantity: 1,
                total: price
            }];
        });
    };

    const updateQuantity = (productId, delta) => {
        setCart(prev => {
            const item = prev.find(i => i.id === productId);
            if (!item) return prev;
            const newQuantity = item.quantity + delta;
            if (newQuantity <= 0) {
                return prev.filter(i => i.id !== productId);
            }
            return prev.map(i =>
                i.id === productId
                    ? { ...i, quantity: newQuantity, total: newQuantity * i.price }
                    : i
            );
        });
    };

    const removeFromCart = (productId) => {
        setCart(prev => prev.filter(item => item.id !== productId));
    };

    const clearCart = () => {
        if (cart.length === 0) return;
        if (window.confirm('Clear all items from order?')) {
            setCart([]);
        }
    };

    // ============================================
    // PLACE ORDER
    // ============================================
    const placeOrder = async () => {
        if (cart.length === 0) {
            alert('Please add items to the order');
            return;
        }

        if (orderType === 'dine_in' && !selectedTableId) {
            alert('Please select a table');
            return;
        }

        setProcessing(true);
        setOrderError(null);
        
        try {
            const orderData = {
                items: cart.map(item => ({
                    product_id: item.id,
                    quantity: item.quantity
                })),
                customer_name: customerName.trim() || 'Walk-in Customer',
                customer_phone: customerPhone || null,
                table_id: selectedTableId || null,
                order_type: orderType,
                notes: specialInstructions,
                source: 'cashier_manual',
                payment_method: paymentMethod
            };

            // ✅ Send Idempotency-Key header (required by backend)
            const response = await API.post('/orders', orderData, {
                headers: {
                    'Idempotency-Key': idempotencyKeyRef.current
                }
            });
            
            if (response.data.success) {
                const order = response.data.data;
                setOrderNumber(order.order_number);

                // ✅ Snapshot the total BEFORE clearing the cart.
                // Prefer backend-returned total if available, else fall back to computed total.
                const backendTotal = order.total_amount ?? order.total ?? null;
                setCompletedTotal(
                    backendTotal !== null ? parseFloat(backendTotal) : total
                );

                setOrderComplete(true);
                setCart([]);
                setCustomerName('');
                setCustomerPhone('');
                setSpecialInstructions('');
                if (orderType === 'dine_in') {
                    setSelectedTableId('');
                }
                // ✅ Generate a NEW idempotency key for the next order
                idempotencyKeyRef.current = generateIdempotencyKey();
            }
        } catch (err) {
            console.error('Place order error:', err);
            setOrderError(err.response?.data?.error || 'Failed to place order');
            alert(err.response?.data?.error || 'Failed to place order');
        } finally {
            setProcessing(false);
        }
    };

    // ============================================
    // RESET
    // ============================================
    const startNewOrder = () => {
        setOrderComplete(false);
        setOrderNumber(null);
        setCompletedTotal(0); // ✅ reset
        setCart([]);
        setCustomerName('');
        setCustomerPhone('');
        setSpecialInstructions('');
        setSelectedTableId('');
        setSearchTerm('');
        setOrderError(null);
        // ✅ Fresh key for the brand-new order
        idempotencyKeyRef.current = generateIdempotencyKey();
    };

    // ============================================
    // TOTALS
    // ============================================
    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
    const tax = subtotal * 0.15;
    const total = subtotal + tax;

    // ============================================
    // FILTERS
    // ============================================
    const filteredProducts = products.filter(product => {
        const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
        const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    // ============================================
    // LOADING
    // ============================================
    if (loading) {
        return (
            <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    // ============================================
    // ORDER COMPLETE
    // ============================================
    if (orderComplete) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-md w-full text-center border border-gray-200 dark:border-gray-700 shadow-lg">
                    <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle size={40} className="text-green-600 dark:text-green-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">✅ Order Complete!</h2>
                    <p className="text-gray-500 dark:text-gray-400 mb-4">Order sent to kitchen</p>
                    
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 mb-6">
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Order Number</p>
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{orderNumber}</p>
                        {/* ✅ Uses completedTotal instead of total (cart is cleared) */}
                        <p className="text-green-600 dark:text-green-400 font-bold mt-2">{formatCurrency(completedTotal)}</p>
                    </div>
                    
                    <button
                        onClick={startNewOrder}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                    >
                        📝 New Order
                    </button>
                </div>
            </div>
        );
    }

    // ============================================
    // RENDER
    // ============================================
    return (
        <div className="h-full flex flex-col lg:flex-row gap-4 md:gap-6 p-4 bg-gray-50 dark:bg-gray-900">
            
            {/* ============================================ */}
            {/* LEFT PANEL - PRODUCTS & FORM */}
            {/* ============================================ */}
            <div className="flex-1 min-w-0">
                {/* HEADER */}
                <div className="mb-4 flex flex-wrap justify-between items-center gap-2">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <ShoppingCart size={24} className="text-blue-600" />
                            Manual Order
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Create orders for walk-in customers</p>
                    </div>
                    <div className="text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-3 py-1 rounded-full">
                        {cart.length} items in cart
                    </div>
                </div>

                {/* ERROR MESSAGE */}
                {orderError && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-4 text-red-600 dark:text-red-400 text-sm">
                        ❌ {orderError}
                    </div>
                )}

                {/* ORDER TYPE SELECTOR */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 mb-4">
                    <div className="flex flex-wrap gap-4 mb-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                value="dine_in"
                                checked={orderType === 'dine_in'}
                                onChange={(e) => {
                                    setOrderType(e.target.value);
                                    if (e.target.value === 'takeaway') {
                                        setSelectedTableId('');
                                    }
                                }}
                                className="w-4 h-4 text-blue-600"
                            />
                            <span className="text-gray-700 dark:text-gray-300">🏠 Dine In</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                value="takeaway"
                                checked={orderType === 'takeaway'}
                                onChange={(e) => {
                                    setOrderType(e.target.value);
                                    if (e.target.value === 'takeaway') {
                                        setSelectedTableId('');
                                    }
                                }}
                                className="w-4 h-4 text-blue-600"
                            />
                            <span className="text-gray-700 dark:text-gray-300">📦 Takeaway</span>
                        </label>
                    </div>

                    {orderType === 'dine_in' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Select Table <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={selectedTableId}
                                onChange={(e) => setSelectedTableId(e.target.value)}
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">-- Select Table --</option>
                                {tables.filter(t => t.status === 'available' || t.status === 'occupied').map(table => (
                                    <option key={table.id} value={table.id}>
                                        Table {table.table_number} ({table.status}) - Capacity: {table.capacity}
                                    </option>
                                ))}
                            </select>
                            {tables.filter(t => t.status === 'available').length === 0 && (
                                <p className="text-yellow-600 dark:text-yellow-400 text-xs mt-2">⚠️ No available tables</p>
                            )}
                        </div>
                    )}

                    {orderType === 'takeaway' && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                            <p className="text-blue-700 dark:text-blue-400 text-sm flex items-center gap-2">
                                📦 Takeaway order - No table needed
                            </p>
                        </div>
                    )}
                </div>

                {/* CUSTOMER INFO */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 mb-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                <User size={14} className="inline mr-1" /> Customer Name
                            </label>
                            <input
                                type="text"
                                placeholder="Walk-in Customer"
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                <Phone size={14} className="inline mr-1" /> Phone
                            </label>
                            <input
                                type="tel"
                                placeholder="Optional"
                                value={customerPhone}
                                onChange={(e) => setCustomerPhone(e.target.value)}
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                    <div className="mt-3">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Special Instructions
                        </label>
                        <input
                            type="text"
                            placeholder="Allergies, preferences, etc."
                            value={specialInstructions}
                            onChange={(e) => setSpecialInstructions(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                {/* SEARCH & CATEGORIES */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 mb-4">
                    <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search products..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full px-4 py-2 pl-10 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={`px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition ${
                                    selectedCategory === cat
                                        ? 'bg-blue-600 text-white shadow-lg'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                            >
                                {cat === 'all' ? 'All Items' : cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ============================================ */}
                {/* PRODUCTS GRID - PRICE IS VISIBLE HERE */}
                {/* ============================================ */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {filteredProducts.map(product => (
                        <button
                            key={product.id}
                            onClick={() => addToCart(product)}
                            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-left hover:border-blue-500 hover:shadow-md transition-all duration-200 hover:scale-105"
                        >
                            <div className="text-3xl text-center mb-2">{getProductEmoji(product.category)}</div>
                            <h3 className="font-semibold text-gray-900 dark:text-white text-sm line-clamp-2">{product.name}</h3>
                            
                            {/* ✅ PRICE IS DISPLAYED HERE */}
                            <p className="text-blue-600 dark:text-blue-400 font-bold text-base mt-1">
                                {formatCurrency(product.price)}
                            </p>
                            
                            <span className="text-xs text-green-600 dark:text-green-400 mt-1 inline-block">+ Add</span>
                        </button>
                    ))}
                </div>
                
                {filteredProducts.length === 0 && (
                    <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                        <p className="text-gray-500 dark:text-gray-400">No products found</p>
                    </div>
                )}
            </div>

            {/* ============================================ */}
            {/* RIGHT PANEL - CART */}
            {/* ============================================ */}
            <div className="w-full lg:w-96 xl:w-[420px] bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col h-[calc(100vh-120px)] lg:h-[calc(100vh-100px)] sticky top-4 shadow-lg">
                
                {/* CART HEADER */}
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <ShoppingCart size={22} className="text-blue-600 dark:text-blue-400" />
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Current Order</h2>
                            <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full text-gray-500">
                                {cart.reduce((sum, i) => sum + i.quantity, 0)} items
                            </span>
                        </div>
                        {cart.length > 0 && (
                            <button 
                                onClick={clearCart} 
                                className="text-red-500 hover:text-red-600 text-sm font-medium transition"
                            >
                                Clear All
                            </button>
                        )}
                    </div>
                    {selectedTableId && orderType === 'dine_in' && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Table: {tables.find(t => t.id === parseInt(selectedTableId))?.table_number || selectedTableId}
                        </p>
                    )}
                    {orderType === 'takeaway' && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">📦 Takeaway</p>
                    )}
                </div>

                {/* CART ITEMS */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {cart.length === 0 ? (
                        <div className="text-center py-12">
                            <ShoppingCart size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                            <p className="text-gray-500 dark:text-gray-400 font-medium">Cart is empty</p>
                            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Tap menu items to add</p>
                            {orderType === 'dine_in' && !selectedTableId && (
                                <p className="text-yellow-600 dark:text-yellow-400 text-xs mt-2">⚠️ Select a table first</p>
                            )}
                        </div>
                    ) : (
                        cart.map(item => (
                            <div key={item.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 border border-gray-100 dark:border-gray-600">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-gray-900 dark:text-white truncate">{item.name}</p>
                                        <p className="text-blue-600 dark:text-blue-400 text-sm">{formatCurrency(item.price)}</p>
                                    </div>
                                    <button 
                                        onClick={() => removeFromCart(item.id)} 
                                        className="text-red-400 hover:text-red-600 p-1 transition"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between mt-2">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => updateQuantity(item.id, -1)}
                                            className="w-7 h-7 bg-gray-200 dark:bg-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500 transition"
                                        >
                                            <Minus size={14} className="text-gray-700 dark:text-gray-300" />
                                        </button>
                                        <span className="text-gray-900 dark:text-white font-semibold text-lg w-8 text-center">{item.quantity}</span>
                                        <button
                                            onClick={() => updateQuantity(item.id, 1)}
                                            className="w-7 h-7 bg-gray-200 dark:bg-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500 transition"
                                        >
                                            <Plus size={14} className="text-gray-700 dark:text-gray-300" />
                                        </button>
                                    </div>
                                    <span className="text-gray-900 dark:text-white font-bold">{formatCurrency(item.total)}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* CART FOOTER */}
                <div className="border-t border-gray-200 dark:border-gray-700 p-4 flex-shrink-0">
                    
                    {/* PAYMENT METHOD */}
                    <div className="mb-4">
                        <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">Payment Method</p>
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                onClick={() => setPaymentMethod('cash')}
                                className={`py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition ${
                                    paymentMethod === 'cash' 
                                        ? 'bg-green-600 text-white' 
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                            >
                                <DollarSign size={16} /> Cash
                            </button>
                            <button
                                onClick={() => setPaymentMethod('card')}
                                className={`py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition ${
                                    paymentMethod === 'card' 
                                        ? 'bg-green-600 text-white' 
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                            >
                                <CreditCard size={16} /> Card
                            </button>
                            <button
                                onClick={() => setPaymentMethod('mobile')}
                                className={`py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition ${
                                    paymentMethod === 'mobile' 
                                        ? 'bg-green-600 text-white' 
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                            >
                                <Smartphone size={16} /> Mobile
                            </button>
                        </div>
                    </div>

                    {/* TOTALS */}
                    <div className="space-y-1 mb-4">
                        <div className="flex justify-between text-gray-600 dark:text-gray-400 text-sm">
                            <span>Subtotal</span>
                            <span>{formatCurrency(subtotal)}</span>
                        </div>
                        <div className="flex justify-between text-gray-600 dark:text-gray-400 text-sm">
                            <span>VAT (15%)</span>
                            <span>{formatCurrency(tax)}</span>
                        </div>
                        <div className="flex justify-between text-gray-900 dark:text-white font-bold text-lg pt-2 border-t border-gray-200 dark:border-gray-700">
                            <span>Total</span>
                            <span className="text-green-600 dark:text-green-400">{formatCurrency(total)}</span>
                        </div>
                    </div>

                    {/* SEND BUTTON */}
                    <button
                        onClick={placeOrder}
                        disabled={cart.length === 0 || (orderType === 'dine_in' && !selectedTableId) || processing}
                        className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl font-bold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {processing ? (
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        ) : (
                            <Send size={18} />
                        )}
                        {processing ? 'Sending...' : 'Send to Kitchen'}
                    </button>
                    
                    {orderType === 'dine_in' && !selectedTableId && cart.length > 0 && (
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 text-center mt-2">⚠️ Please select a table</p>
                    )}
                    
                    <p className="text-xs text-gray-400 text-center mt-2">
                        Order will be sent directly to kitchen
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ManualOrder;