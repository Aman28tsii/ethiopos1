import React, { useState, useEffect } from 'react';
import API from '../../api/axios';
import { 
  Plus, Edit2, Trash2, X, Loader2, RefreshCw, 
  Table, QrCode, Users 
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const ManageTables = () => {
  const { t } = useLanguage();
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [notification, setNotification] = useState('');
  const [formData, setFormData] = useState({
    table_number: '',
    capacity: 4,
    status: 'available'
  });

  useEffect(() => {
    fetchTables();
  }, []);

  const fetchTables = async () => {
    setLoading(true);
    try {
      const response = await API.get('/tables');
      setTables(response.data.data || []);
    } catch (err) {
      console.error('Fetch tables error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingTable) {
        await API.put(`/tables/${editingTable.id}`, formData);
        setNotification(`${t('table')} ${formData.table_number} ${t('updatedSuccessfully')}`);
      } else {
        await API.post('/tables', formData);
        setNotification(`${t('table')} ${formData.table_number} ${t('createdSuccessfully')}`);
      }
      resetModal();
      fetchTables();
      setTimeout(() => setNotification(''), 3000);
    } catch (err) {
      console.error('Save error:', err);
      alert(err.response?.data?.error || t('failedToSaveTable'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (table) => {
    if (window.confirm(`${t('deleteTableConfirm')} ${table.table_number}?`)) {
      try {
        await API.delete(`/tables/${table.id}`);
        setNotification(`${t('table')} ${table.table_number} ${t('deletedSuccessfully')}`);
        fetchTables();
        setTimeout(() => setNotification(''), 3000);
      } catch (err) {
        alert(err.response?.data?.error || t('failedToDeleteTable'));
      }
    }
  };

  const resetModal = () => {
    setShowModal(false);
    setEditingTable(null);
    setFormData({ table_number: '', capacity: 4, status: 'available' });
  };

  const getNextTableNumber = () => {
    if (tables.length === 0) return 1;
    const numbers = tables.map(t => t.table_number);
    for (let i = 1; i <= numbers.length + 1; i++) {
      if (!numbers.includes(i)) return i;
    }
    return tables.length + 1;
  };

  const openCreateModal = () => {
    setFormData({
      table_number: getNextTableNumber(),
      capacity: 4,
      status: 'available'
    });
    setEditingTable(null);
    setShowModal(true);
  };

  const getStatusBadge = (status) => {
    const colors = {
      available: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
      occupied: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
      reserved: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
      cleaning: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
    };
    return colors[status] || 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
  };

  const generateQRForTable = (tableNumber) => {
    const qrUrl = `${window.location.origin}/qr-menu?table=${tableNumber}`;
    navigator.clipboard.writeText(qrUrl);
    alert(`${t('qrUrlCopied')}\n\n${qrUrl}`);
  };

  if (loading && tables.length === 0) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="animate-spin text-blue-500" size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('manageTables')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('addEditRemoveTables')}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchTables} className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-xl flex items-center gap-2 transition">
            <RefreshCw size={18} />
            {t('refresh')}
          </button>
          <button onClick={openCreateModal} className="bg-blue-600 hover:bg-blue-700 text-gray-900 dark:text-gray-900 dark:text-white px-4 py-2 rounded-xl flex items-center gap-2 transition">
            <Plus size={18} />
            {t('addTable')}
          </button>
        </div>
      </div>

      {notification && (
        <div className="bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl p-3 text-green-700 dark:text-green-400 text-center">
          {notification}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center border border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400 text-sm">{t('totalTables')}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{tables.length}</p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 text-center border border-green-200 dark:border-green-800">
          <p className="text-green-700 dark:text-green-400 text-sm">{t('available')}</p>
          <p className="text-2xl font-bold text-green-700 dark:text-green-400">{tables.filter(t => t.status === 'available').length}</p>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 text-center border border-red-200 dark:border-red-800">
          <p className="text-red-700 dark:text-red-400 text-sm">{t('occupied')}</p>
          <p className="text-2xl font-bold text-red-700 dark:text-red-400">{tables.filter(t => t.status === 'occupied').length}</p>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-4 text-center border border-yellow-200 dark:border-yellow-800">
          <p className="text-yellow-700 dark:text-yellow-400 text-sm">{t('reservedCleaning')}</p>
          <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{tables.filter(t => t.status === 'reserved' || t.status === 'cleaning').length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {tables.map(table => (
          <div key={table.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:border-blue-500/50 transition-all shadow-sm hover:shadow-md">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('table')} {table.table_number}</h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm flex items-center gap-1">
                    <Users size={14} />
                    {t('capacity')}: {table.capacity} {t('seats')}
                  </p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusBadge(table.status)}`}>
                  {t(table.status)}
                </span>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditingTable(table);
                    setFormData({
                      table_number: table.table_number,
                      capacity: table.capacity,
                      status: table.status
                    });
                    setShowModal(true);
                  }}
                  className="flex-1 py-2 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-800/50 text-blue-700 dark:text-blue-400 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-1"
                >
                  <Edit2 size={14} />
                  {t('edit')}
                </button>
                <button
                  onClick={() => generateQRForTable(table.table_number)}
                  className="flex-1 py-2 bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-800/50 text-purple-700 dark:text-purple-400 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-1"
                >
                  <QrCode size={14} />
                  QR
                </button>
                <button
                  onClick={() => handleDelete(table)}
                  className="flex-1 py-2 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-800/50 text-red-700 dark:text-red-400 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-1"
                >
                  <Trash2 size={14} />
                  {t('delete')}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {tables.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <Table size={48} className="mx-auto text-gray-500 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">{t('noTablesFound')}</p>
          <button onClick={openCreateModal} className="mt-4 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
            {t('addYourFirstTable')}
          </button>
        </div>
      )}

      {/* Add/Edit Table Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full border border-gray-200 dark:border-gray-700 shadow-xl">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {editingTable ? t('editTable') : t('addNewTable')}
              </h2>
              <button onClick={resetModal} className="text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('tableNumber')} *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={formData.table_number}
                  onChange={(e) => setFormData({ ...formData, table_number: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('capacity')} *</label>
                <input
                  type="number"
                  required
                  min="1"
                  max="20"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 4 })}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('initialStatus')}</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="available">{t('available')}</option>
                  <option value="reserved">{t('reserved')}</option>
                  <option value="cleaning">{t('cleaning')}</option>
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('newTableNote')}</p>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-gray-900 dark:text-gray-900 dark:text-white rounded-xl font-semibold transition">
                  {editingTable ? t('update') : t('create')}
                </button>
                <button type="button" onClick={resetModal} className="flex-1 py-2 bg-gray-100 dark:bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-semibold transition">
                  {t('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageTables;