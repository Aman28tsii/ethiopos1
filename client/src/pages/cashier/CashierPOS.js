import React, { useState, useEffect } from 'react';
import API from '../../api/axios';
import { Loader2, DollarSign, CreditCard, Smartphone, Printer } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const CashierPOS = () => {
    const { t } = useLanguage();
    const [readyOrders, setReadyOrders] = useState([]);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [processing, setProcessing] = useState(false);
    const [salesHistory, setSalesHistory] = useState([]);
    const [todaySales, setTodaySales] = useState(null);
    const [showHistory, setShowHistory] = useState(false);

    useEffect(() => {
        fetchReadyOrders();
        fetchSalesHistory();
        fetchTodaySales();
        const interval = setInterval(() => {
            fetchReadyOrders();
            fetchSalesHistory();
            fetchTodaySales();
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchReadyOrders = async () => {
        try {
            const response = await API.get('/orders/ready');
            setReadyOrders(response.data.data || []);
        } catch (err) {
            console.error('Fetch ready orders error:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchSalesHistory = async () => {
        try {
            const response = await API.get('/sales');
            setSalesHistory(response.data.data || []);
        } catch (err) {
            console.error('Fetch sales history error:', err);
        }
    };

    const fetchTodaySales = async () => {
        try {
            const response = await API.get('/sales/today');
            setTodaySales(response.data.data);
        } catch (err) {
            console.error('Fetch today sales error:', err);
        }
    };

    const processPayment = async () => {
        if (!selectedOrder) return;
        
        setProcessing(true);
        try {
            const response = await API.post(`/orders/${selectedOrder.id}/pay`, {
                payment_method: paymentMethod
            });
            
            if (response.data.success) {
                alert(`✅ Payment successful! ${selectedOrder.order_number} completed.`);
                setSelectedOrder(null);
                fetchReadyOrders();
                fetchSalesHistory();
                fetchTodaySales();
            }
        } catch (err) {
            console.error('Payment error:', err);
            alert(err.response?.data?.error || 'Payment failed');
        } finally {
            setProcessing(false);
        }
    };

    const formatCurrency = (value) => {
        return `Br ${parseFloat(value || 0).toFixed(2)}`;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="animate-spin text-blue-500" size={40} />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col gap-6">
            {/* Today's Sales Summary */}
            {todaySales && (
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-4 text-white">
                    <div className="flex justify-between items-center flex-wrap gap-4">
                        <div>
                            <p className="text-blue-200 text-sm">Today's Sales</p>
                            <p className="text-2xl font-bold">{formatCurrency(todaySales.total_revenue)}</p>
                            <p className="text-blue-200 text-sm mt-1">{todaySales.total_orders} orders</p>
                        </div>
                        <div className="text-right">
                            <p className="text-blue-200 text-sm">Average Order</p>
                            <p className="text-xl font-bold">{formatCurrency(todaySales.average_order)}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
                <button
                    onClick={() => setShowHistory(false)}
                    className={`px-6 py-3 font-semibold transition-all ${
                        !showHistory
                            ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                >
                    🧾 Ready for Payment ({readyOrders.length})
                </button>
                <button
                    onClick={() => setShowHistory(true)}
                    className={`px-6 py-3 font-semibold transition-all ${
                        showHistory
                            ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                >
                    📜 Sales History
                </button>
            </div>

            {/* Content */}
            {!showHistory ? (
                <div className="flex-1 flex flex-col lg:flex-row gap-6">
                    {/* Orders List */}
                    <div className="flex-1">
                        {readyOrders.length === 0 ? (
                            <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center border border-gray-200 dark:border-gray-700">
                                <p className="text-gray-500 dark:text-gray-400 text-lg">No orders ready for payment</p>
                                <p className="text-gray-500 dark:text-gray-400 mt-2">Orders from kitchen will appear here</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {readyOrders.map(order => (
                                    <button
                                        key={order.id}
                                        onClick={() => setSelectedOrder(order)}
                                        className={`bg-white dark:bg-gray-800 rounded-2xl p-6 text-left border-2 transition-all ${
                                            selectedOrder?.id === order.id 
                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <p className="text-gray-900 dark:text-white font-bold text-lg">{order.order_number}</p>
                                                <p className="text-gray-500 dark:text-gray-400 text-sm">Table: {order.table_number || 'Takeaway'}</p>
                                            </div>
                                            <p className="text-green-600 dark:text-green-400 font-bold text-xl">{formatCurrency(order.total_amount)}</p>
                                        </div>
                                        <p className="text-gray-600 dark:text-gray-300 text-sm">Customer: {order.customer_name || 'Walk-in Customer'}</p>
                                        <p className="text-gray-500 dark:text-gray-400 text-xs mt-2">
                                            Ready since: {new Date(order.created_at).toLocaleTimeString()}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Payment Panel */}
                    {selectedOrder && (
                        <div className="w-full lg:w-96 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 flex flex-col shadow-lg">
                            <div className="mb-6">
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Payment</h2>
                                <p className="text-gray-500 dark:text-gray-400 text-sm">Order: {selectedOrder.order_number}</p>
                            </div>

                            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 mb-6">
                                <div className="flex justify-between mb-2">
                                    <span className="text-gray-600 dark:text-gray-400">Order Total</span>
                                    <span className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(selectedOrder.total_amount)}</span>
                                </div>
                            </div>

                            <div className="mb-6">
                                <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">Payment Method</p>
                                <div className="grid grid-cols-3 gap-3">
                                    <button
                                        onClick={() => setPaymentMethod('cash')}
                                        className={`py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition ${
                                            paymentMethod === 'cash' 
                                                ? 'bg-green-600 text-white' 
                                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                        }`}
                                    >
                                        <DollarSign size={18} />
                                        Cash
                                    </button>
                                    <button
                                        onClick={() => setPaymentMethod('card')}
                                        className={`py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition ${
                                            paymentMethod === 'card' 
                                                ? 'bg-green-600 text-white' 
                                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                        }`}
                                    >
                                        <CreditCard size={18} />
                                        Card
                                    </button>
                                    <button
                                        onClick={() => setPaymentMethod('mobile')}
                                        className={`py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition ${
                                            paymentMethod === 'mobile' 
                                                ? 'bg-green-600 text-white' 
                                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                        }`}
                                    >
                                        <Smartphone size={18} />
                                        Mobile
                                    </button>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-auto">
                                <button
                                    onClick={() => setSelectedOrder(null)}
                                    className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-semibold transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={processPayment}
                                    disabled={processing}
                                    className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-lg disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {processing ? <Loader2 className="animate-spin" size={20} /> : <Printer size={18} />}
                                    Complete
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                // Sales History
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 dark:bg-gray-700/50">
                                <tr>
                                    <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm font-semibold">Sale #</th>
                                    <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm font-semibold">Date</th>
                                    <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm font-semibold">Customer</th>
                                    <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm font-semibold">Total</th>
                                    <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm font-semibold">Payment</th>
                                    <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm font-semibold">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {salesHistory.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                                            No sales found
                                        </td>
                                    </tr>
                                ) : (
                                    salesHistory.slice(0, 20).map(sale => (
                                        <tr key={sale.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                            <td className="px-6 py-4 text-gray-900 dark:text-white font-medium">{sale.sale_number}</td>
                                            <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{new Date(sale.created_at).toLocaleString()}</td>
                                            <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{sale.customer_name || 'Walk-in'}</td>
                                            <td className="px-6 py-4 text-green-600 dark:text-green-400 font-semibold">{formatCurrency(sale.total_amount)}</td>
                                            <td className="px-6 py-4 text-gray-600 dark:text-gray-300 capitalize">{sale.payment_method}</td>
                                            <td className="px-6 py-4">
                                                <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-semibold">
                                                    {sale.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CashierPOS;s