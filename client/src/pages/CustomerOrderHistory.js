import React, { useState, useEffect } from 'react';
import API from '../api/axios';
import { Search, Clock, CheckCircle, Coffee, Loader2, Receipt, Phone, User, Calendar, DollarSign } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const CustomerOrderHistory = () => {
  const { t } = useLanguage();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [orders, setOrders] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const searchCustomer = async (e) => {
    e.preventDefault();
    if (!phoneNumber.trim()) {
      alert(t('pleaseEnterPhoneNumber'));
      return;
    }

    setLoading(true);
    try {
      const response = await API.get(`/customers/orders/${phoneNumber}`);
      if (response.data.success) {
        setCustomer(response.data.customer);
        setOrders(response.data.orders);
        setSearched(true);
      }
    } catch (err) {
      console.error('Search error:', err);
      alert(t('noOrdersFoundForPhone'));
      setSearched(true);
      setOrders([]);
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return `Br ${parseFloat(value || 0).toFixed(2)}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const getStatusBadge = (status) => {
    const statuses = {
      pending: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
      preparing: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
      ready: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
      completed: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
      cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
    };
    return statuses[status] || 'bg-gray-100 dark:bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-600 dark:text-gray-300';
  };

  const getStatusText = (status) => {
    const statusMap = {
      pending: t('pending'),
      preparing: t('preparing'),
      ready: t('ready'),
      completed: t('completed'),
      cancelled: t('cancelled')
    };
    return statusMap[status] || status;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-50 dark:bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600 dark:text-blue-500" size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-50 dark:bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white mb-2">{t('orderHistory')}</h1>
          <p className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400">{t('enterPhoneToViewOrders')}</p>
        </div>

        {/* Search Form */}
        <div className="bg-white dark:bg-white dark:bg-white dark:bg-gray-800 rounded-2xl p-6 mb-8 border border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700 shadow-sm">
          <form onSubmit={searchCustomer} className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-500 dark:text-gray-400 dark:text-gray-500" size={18} />
              <input
                type="tel"
                placeholder={t('enterPhoneNumber')}
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full px-4 py-3 pl-10 bg-gray-50 dark:bg-gray-50 dark:bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-gray-900 dark:text-gray-900 dark:text-white rounded-xl font-semibold transition flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
              {t('viewOrders')}
            </button>
          </form>
        </div>

        {/* Results */}
        {searched && (
          <>
            {customer && (
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-6 mb-6 text-gray-900 dark:text-gray-900 dark:text-white">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                    <User size={32} className="text-gray-900 dark:text-gray-900 dark:text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-1">{t('customerInfo')}</h3>
                    <p className="text-2xl font-bold">{customer.name}</p>
                    <p className="text-blue-100 mt-1">{customer.phone}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-white/20">
                  <div className="text-center">
                    <p className="text-blue-200 text-sm">{t('totalOrders')}</p>
                    <p className="text-xl font-bold">{customer.total_orders || 0}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-blue-200 text-sm">{t('totalSpent')}</p>
                    <p className="text-xl font-bold">{formatCurrency(customer.total_spent)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-blue-200 text-sm">{t('loyaltyPoints')}</p>
                    <p className="text-xl font-bold">{customer.loyalty_points || 0}</p>
                  </div>
                </div>
              </div>
            )}

            {orders.length === 0 ? (
              <div className="bg-white dark:bg-white dark:bg-white dark:bg-gray-800 rounded-2xl p-12 text-center border border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700 shadow-sm">
                <Receipt size={48} className="mx-auto text-gray-500 dark:text-gray-500 dark:text-gray-400 dark:text-gray-600 mb-3" />
                <p className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400">{t('noOrdersFound')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white font-semibold text-lg mb-4 flex items-center gap-2">
                  <Clock size={20} className="text-blue-600 dark:text-blue-400" />
                  {t('recentOrders')}
                </h3>
                {orders.map(order => (
                  <div key={order.id} className="bg-white dark:bg-white dark:bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-300 dark:border-gray-600 transition-all shadow-sm hover:shadow-md">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
                      <div>
                        <p className="text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white font-bold text-lg">#{order.order_number}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Calendar size={14} className="text-gray-500 dark:text-gray-500 dark:text-gray-400 dark:text-gray-500" />
                          <p className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 text-sm">{formatDate(order.created_at)}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 items-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(order.status)}`}>
                          {getStatusText(order.status)}
                        </span>
                        <span className="text-green-600 dark:text-green-400 font-bold">{formatCurrency(order.total_amount)}</span>
                      </div>
                    </div>
                    
                    {order.items && order.items.length > 0 && (
                      <div className="border-t border-gray-100 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700 pt-3 mt-2">
                        <p className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 text-sm mb-2 flex items-center gap-1">
                          <DollarSign size={14} />
                          {t('items')}:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {order.items.slice(0, 3).map((item, idx) => (
                            <span key={idx} className="text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300 text-sm bg-gray-100 dark:bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-lg">
                              {item.quantity}x {item.product_name}
                            </span>
                          ))}
                          {order.items.length > 3 && (
                            <span className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 text-sm">+{order.items.length - 3} {t('more')}</span>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setSelectedOrder(order);
                            setShowDetailsModal(true);
                          }}
                          className="mt-3 text-blue-600 dark:text-blue-400 text-sm hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1"
                        >
                          <Search size={14} />
                          {t('viewDetails')}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Order Details Modal */}
      {showDetailsModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-white dark:bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto border border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700">
            <div className="sticky top-0 bg-white dark:bg-white dark:bg-white dark:bg-gray-800 p-4 border-b border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white">{t('orderDetails')}</h2>
              <button onClick={() => setShowDetailsModal(false)} className="text-gray-500 dark:text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-600 dark:text-gray-600 dark:text-gray-300">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-gray-50 dark:bg-gray-100 dark:bg-gray-700/50 rounded-xl p-3">
                <p className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 text-xs">{t('orderNumber')}</p>
                <p className="text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white font-bold text-lg">{selectedOrder.order_number}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-100 dark:bg-gray-700/50 rounded-xl p-3">
                <p className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 text-xs">{t('status')}</p>
                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${getStatusBadge(selectedOrder.status)}`}>
                  {getStatusText(selectedOrder.status)}
                </span>
              </div>
              <div className="bg-gray-50 dark:bg-gray-100 dark:bg-gray-700/50 rounded-xl p-3">
                <p className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 text-xs">{t('totalAmount')}</p>
                <p className="text-green-600 dark:text-green-400 font-bold text-xl">{formatCurrency(selectedOrder.total_amount)}</p>
              </div>
              <div className="border-t border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700 pt-3">
                <p className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 text-sm mb-2">{t('items')}:</p>
                <div className="space-y-2">
                  {selectedOrder.items && selectedOrder.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm py-1 border-b border-gray-100 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700 last:border-0">
                      <span className="text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300">{item.quantity}x {item.product_name}</span>
                      <span className="text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white font-medium">{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>
              {selectedOrder.notes && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3">
                  <p className="text-yellow-700 dark:text-yellow-400 text-xs">{t('specialInstructions')}</p>
                  <p className="text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300 text-sm">{selectedOrder.notes}</p>
                </div>
              )}
              <div className="border-t border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700 pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400">{t('orderDate')}</span>
                  <span className="text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300 text-sm">{formatDate(selectedOrder.created_at)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerOrderHistory;