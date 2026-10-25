import React, { useState, useEffect } from 'react';
import API from '../api/axios';
import { 
  Receipt, Plus, Edit2, Trash2, Search, X, 
  Calendar, DollarSign, TrendingUp, TrendingDown,
  PieChart, Loader2, Copy  // ★ Copy icon added
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { formatCurrency } from '../utils/formatting';

const Expenses = () => {
  const { t } = useLanguage();
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);  // ★ NEW
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setDate(1)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [formData, setFormData] = useState({
    category: '',
    amount: '',
    description: '',
    expense_date: new Date().toISOString().split('T')[0]
  });

  const expenseCategories = [
    t('rent'), t('utilities'), t('salaries'), t('marketing'), 
    t('maintenance'), t('supplies'), t('transport'), t('insurance'), 
    t('taxes'), t('other')
  ];

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [expensesRes, summaryRes] = await Promise.all([
        API.get('/expenses', { params: dateRange }),
        API.get('/expenses/summary', { params: dateRange })
      ]);
      setExpenses(expensesRes.data.data || []);
      setSummary(summaryRes.data.data);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ★ NEW: Copy last month's expenses
  const handleCopyPreviousMonth = async () => {
    const confirmed = window.confirm(
      'Copy all expenses from LAST MONTH into THIS MONTH?\n\n' +
      '• Items already present this month (same category + amount) will be skipped.\n' +
      '• You can edit or delete any copied item afterward.\n\n' +
      'Continue?'
    );
    if (!confirmed) return;

    setCopying(true);
    try {
      const res = await API.post('/expenses/copy-from-previous-month');
      const { copied_count, skipped_count } = res.data.data;

      if (copied_count === 0) {
        alert(`ℹ️ Nothing new to copy.\n\n${skipped_count} expense(s) from last month already exist this month.`);
      } else {
        let msg = `✅ Copied ${copied_count} expense(s) from last month.`;
        if (skipped_count > 0) {
          msg += `\n\n${skipped_count} expense(s) already existed this month and were skipped.`;
        }
        alert(msg);
      }
      fetchData();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to copy expenses';
      alert('❌ ' + msg);
    } finally {
      setCopying(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingExpense) {
        await API.put(`/expenses/${editingExpense.id}`, formData);
      } else {
        await API.post('/expenses', formData);
      }
      resetModal();
      fetchData();
    } catch (err) {
      console.error('Save error:', err);
      alert(err.response?.data?.error || t('saveFailed'));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('deleteConfirm'))) {
      try {
        await API.delete(`/expenses/${id}`);
        fetchData();
      } catch (err) {
        alert(err.response?.data?.error || t('deleteFailed'));
      }
    }
  };

  const resetModal = () => {
    setShowModal(false);
    setEditingExpense(null);
    setFormData({
      category: '',
      amount: '',
      description: '',
      expense_date: new Date().toISOString().split('T')[0]
    });
  };

  const filteredExpenses = expenses.filter(e =>
    e.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (e.description && e.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-blue-500" size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('expenseTracking')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('trackBusinessOperationalCosts')}</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          {/* ★ NEW: Copy Last Month button */}
          <button
            onClick={handleCopyPreviousMonth}
            disabled={copying}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl font-semibold flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
            title="Copy all expenses from last month into this month"
          >
            {copying ? <Loader2 size={18} className="animate-spin" /> : <Copy size={18} />}
            {copying ? 'Copying...' : 'Copy Last Month'}
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-semibold flex items-center gap-2 transition"
          >
            <Plus size={18} />
            {t('addExpense')}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-gray-500 dark:text-gray-400" />
            <span className="text-gray-700 dark:text-gray-300">{t('from')}:</span>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              className="px-3 py-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-700 dark:text-gray-300">{t('to')}:</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              className="px-3 py-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => {
              const today = new Date();
              const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
              setDateRange({
                startDate: firstDay.toISOString().split('T')[0],
                endDate: today.toISOString().split('T')[0]
              });
            }}
            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-gray-700 dark:text-gray-300 text-sm transition"
          >
            {t('thisMonth')}
          </button>
          <button
            onClick={() => {
              const today = new Date();
              const firstDay = new Date(today.getFullYear(), 0, 1);
              setDateRange({
                startDate: firstDay.toISOString().split('T')[0],
                endDate: today.toISOString().split('T')[0]
              });
            }}
            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-gray-700 dark:text-gray-300 text-sm transition"
          >
            {t('thisYear')}
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <Receipt size={20} className="text-red-600 dark:text-red-400" />
              </div>
              <p className="text-gray-600 dark:text-gray-400">{t('totalExpenses')}</p>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(summary.summary.total_amount)}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{summary.summary.total_count} {t('transactions')}</p>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <TrendingUp size={20} className="text-orange-600 dark:text-orange-400" />
              </div>
              <p className="text-gray-600 dark:text-gray-400">{t('averageDaily')}</p>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(summary.summary.total_amount / 30)}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('perDay')}</p>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <PieChart size={20} className="text-purple-600 dark:text-purple-400" />
              </div>
              <p className="text-gray-600 dark:text-gray-400">{t('categories')}</p>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.by_category.length}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('differentExpenseTypes')}</p>
          </div>
        </div>
      )}

      {summary && summary.by_category && summary.by_category.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-gray-900 dark:text-white font-semibold">{t('expenseByCategory')}</h3>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              {summary.by_category.map((cat, idx) => {
                const percentage = (cat.total_amount / summary.summary.total_amount) * 100;
                return (
                  <div key={idx}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 dark:text-gray-300">{cat.category}</span>
                      <span className="text-gray-900 dark:text-white font-semibold">{formatCurrency(cat.total_amount)}</span>
                    </div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-red-500 rounded-full"
                        style={{ width: percentage.toFixed(2) + '%' }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{cat.count} {t('transactions')}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400" size={18} />
        <input
          type="text"
          placeholder={t('searchExpenses')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 pl-10"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X size={18} className="text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm">{t('date')}</th>
                <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm">{t('category')}</th>
                <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm">{t('description')}</th>
                <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm text-right">{t('amount')}</th>
                <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm">{t('recordedBy')}</th>
                <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredExpenses.map(expense => (
                <tr key={expense.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                  <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                    {new Date(expense.expense_date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300">
                      {expense.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400 max-w-xs truncate">
                    {expense.description || '-'}
                  </td>
                  <td className="px-6 py-4 text-right text-red-600 dark:text-red-400 font-semibold">
                    {formatCurrency(expense.amount)}
                  </td>
                  <td className="px-6 py-4 text-gray-500 dark:text-gray-400 text-sm">
                    {expense.created_by_name || t('system')}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingExpense(expense);
                          setFormData({
                            category: expense.category,
                            amount: expense.amount,
                            description: expense.description || '',
                            expense_date: expense.expense_date.split('T')[0]
                          });
                          setShowModal(true);
                        }}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(expense.id)}
                        className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredExpenses.length === 0 && (
          <div className="text-center py-12">
            <Receipt size={48} className="mx-auto text-gray-500 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">{t('noExpensesFound')}</p>
          </div>
        )}
      </div>

      {/* Add/Edit Expense Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editingExpense ? t('editExpense') : t('addExpense')}
                </h2>
                <button onClick={resetModal} className="text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('category')} *</label>
                  <select
                    required
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">{t('selectCategory')}</option>
                    {expenseCategories.map(cat => (
                      <option key={cat} value={cat.toLowerCase()}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('amount')} *</label>
                  <div className="relative">
                    <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 pl-9 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('expenseDate')} *</label>
                  <input
                    type="date"
                    required
                    value={formData.expense_date}
                    onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('description')}</label>
                  <textarea
                    rows="3"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={t('optionalDescription')}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="submit" className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition">
                    {editingExpense ? t('update') : t('save')}
                  </button>
                  <button type="button" onClick={resetModal} className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-semibold transition">
                    {t('cancel')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;