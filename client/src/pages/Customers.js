import React, { useState, useEffect } from 'react';
import API from '../api/axios';
import { 
  Users, Plus, Edit2, Trash2, Search, X, 
  Star, Phone, Mail, MapPin, Calendar, Award,
  Loader2, RefreshCw, TrendingUp, UserPlus, Eye 
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { formatCurrency } from '../utils/formatting';

const Customers = () => {
  const { t } = useLanguage();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    loyalty_points: 0,
    total_spent: 0,
    visit_count: 0,
    notes: ''
  });

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const response = await API.get('/customers');
      setCustomers(response.data.data || []);
    } catch (err) {
      console.error('Fetch customers error:', err);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCustomer) {
        await API.put(/customers/, formData);
        alert(t('customerUpdated'));
      } else {
        await API.post('/customers', formData);
        alert(t('customerCreated'));
      }
      resetModal();
      fetchCustomers();
    } catch (err) {
      console.error('Save error:', err);
      alert(err.response?.data?.error || t('saveFailed'));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('deleteCustomerConfirm'))) {
      try {
        await API.delete(/customers/);
        alert(t('customerDeleted'));
        fetchCustomers();
      } catch (err) {
        alert(err.response?.data?.error || t('deleteFailed'));
      }
    }
  };

  const resetModal = () => {
    setShowModal(false);
    setEditingCustomer(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      address: '',
      loyalty_points: 0,
      total_spent: 0,
      visit_count: 0,
      notes: ''
    });
  };

  const filteredCustomers = customers.filter(c =>
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.includes(searchTerm)
  );

  const totalCustomers = customers.length;
  const totalLoyaltyPoints = customers.reduce((sum, c) => sum + (c.loyalty_points || 0), 0);
  const totalSpent = customers.reduce((sum, c) => sum + (c.total_spent || 0), 0);
  const avgSpent = totalCustomers > 0 ? totalSpent / totalCustomers : 0;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="animate-spin text-blue-500" size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('customerManagement')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('manageCustomerAccounts')}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-semibold flex items-center gap-2 transition"
        >
          <UserPlus size={18} />
          {t('addCustomer')}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-xl p-4 text-white">
          <Users size={24} className="mb-2 opacity-80" />
          <p className="text-purple-200 text-sm">{t('totalCustomers')}</p>
          <p className="text-2xl font-bold">{totalCustomers}</p>
        </div>
        <div className="bg-gradient-to-r from-yellow-600 to-yellow-700 rounded-xl p-4 text-white">
          <Award size={24} className="mb-2 opacity-80" />
          <p className="text-yellow-200 text-sm">{t('totalLoyaltyPoints')}</p>
          <p className="text-2xl font-bold">{totalLoyaltyPoints}</p>
        </div>
        <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-xl p-4 text-white">
          <TrendingUp size={24} className="mb-2 opacity-80" />
          <p className="text-green-200 text-sm">{t('totalSpent')}</p>
          <p className="text-2xl font-bold">{formatCurrency(totalSpent)}</p>
        </div>
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-4 text-white">
          <Star size={24} className="mb-2 opacity-80" />
          <p className="text-blue-200 text-sm">{t('avgSpentPerCustomer')}</p>
          <p className="text-2xl font-bold">{formatCurrency(avgSpent)}</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400" size={18} />
        <input
          type="text"
          placeholder={t('searchCustomers')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white pl-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X size={18} className="text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
          </button>
        )}
      </div>

      {/* Customers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCustomers.map(customer => (
          <div key={customer.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:border-gray-300 dark:hover:border-gray-600 transition-all shadow-sm hover:shadow-md">
            <div className="p-5">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-xl">
                    {customer.name?.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-lg">{customer.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Star size={14} className="text-yellow-500" />
                      <span className="text-yellow-600 dark:text-yellow-400 text-sm font-semibold">{customer.loyalty_points || 0} {t('points')}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedCustomer(customer);
                      setShowDetailsModal(true);
                    }}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                    title={t('viewDetails')}
                  >
                    <Eye size={18} />
                  </button>
                  <button
                    onClick={() => {
                      setEditingCustomer(customer);
                      setFormData(customer);
                      setShowModal(true);
                    }}
                    className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300"
                    title={t('edit')}
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(customer.id)}
                    className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                    title={t('delete')}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                  <Phone size={14} />
                  <span>{customer.phone || t('notProvided')}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                  <Mail size={14} />
                  <span className="truncate">{customer.email || t('notProvided')}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                  <Calendar size={14} />
                  <span>{t('visits')}: {customer.visit_count || 0}</span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                <span className="text-gray-500 dark:text-gray-400 text-xs">{t('totalSpent')}</span>
                <span className="text-green-600 dark:text-green-400 font-bold">{formatCurrency(customer.total_spent)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredCustomers.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <Users size={48} className="mx-auto text-gray-500 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">{t('noCustomersFound')}</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            {t('addYourFirstCustomer')}
          </button>
        </div>
      )}

      {/* Add/Edit Customer Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
            <div className="sticky top-0 bg-white dark:bg-gray-800 p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {editingCustomer ? t('editCustomer') : t('addCustomer')}
              </h2>
              <button onClick={resetModal} className="text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={24} aria-label="Close" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('fullName')} *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t('enterFullName')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('phoneNumber')}</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+251 XXX XXX XXX"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('emailAddress')}</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="customer@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('address')}</label>
                <textarea
                  rows="2"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t('customerAddress')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('notes')}</label>
                <textarea
                  rows="2"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t('specialNotes')}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition">
                  {editingCustomer ? t('update') : t('create')}
                </button>
                <button type="button" onClick={resetModal} className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-semibold transition">
                  {t('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Details Modal */}
      {showDetailsModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('customerDetails')}</h2>
              <button onClick={() => setShowDetailsModal(false)} className="text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={24} aria-label="Close" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-2xl">
                  {selectedCustomer.name?.charAt(0)}
                </div>
                <div>
                  <h3 className="text-gray-900 dark:text-white font-bold text-lg">{selectedCustomer.name}</h3>
                  <div className="flex items-center gap-1 mt-1">
                    <Star size={14} className="text-yellow-500" />
                    <span className="text-yellow-600 dark:text-yellow-400">{selectedCustomer.loyalty_points || 0} {t('points')}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                  <Phone size={16} className="text-gray-500 dark:text-gray-400" />
                  <span>{selectedCustomer.phone || t('notProvided')}</span>
                </div>
                <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                  <Mail size={16} className="text-gray-500 dark:text-gray-400" />
                  <span>{selectedCustomer.email || t('notProvided')}</span>
                </div>
                <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                  <MapPin size={16} className="text-gray-500 dark:text-gray-400" />
                  <span>{selectedCustomer.address || t('notProvided')}</span>
                </div>
              </div>

              <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                <h4 className="text-gray-900 dark:text-white font-semibold mb-3">{t('statistics')}</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
                    <p className="text-gray-500 dark:text-gray-400 text-xs">{t('totalVisits')}</p>
                    <p className="text-gray-900 dark:text-white font-bold text-xl">{selectedCustomer.visit_count || 0}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
                    <p className="text-gray-500 dark:text-gray-400 text-xs">{t('totalSpent')}</p>
                    <p className="text-green-600 dark:text-green-400 font-bold text-xl">{formatCurrency(selectedCustomer.total_spent)}</p>
                  </div>
                </div>
              </div>

              {selectedCustomer.favorite_items && selectedCustomer.favorite_items.length > 0 && (
                <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                  <h4 className="text-gray-900 dark:text-white font-semibold mb-2">{t('favoriteItems')}</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedCustomer.favorite_items.map((item, idx) => (
                      <span key={idx} className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg text-xs">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedCustomer.notes && (
                <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                  <h4 className="text-gray-900 dark:text-white font-semibold mb-2">{t('notes')}</h4>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">{selectedCustomer.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
