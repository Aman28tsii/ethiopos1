import React, { useState, useEffect, useCallback, useMemo } from 'react';
import API from '../api/axios';
import { Users, Plus, Edit2, Trash2, Search, X, Loader2, RefreshCw, ChefHat, Wine, Layers } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const Staff = () => {
  const { t } = useLanguage();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'cashier',
    phone: '',
    station_type: 'kitchen'
  });

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const response = await API.get('/auth/users');
      const users = response.data?.data || response.data || [];
      setStaff(users);
      if (users.length === 0) {
        setError(t('noStaffMembersFound'));
      } else {
        setError('');
      }
    } catch (err) {
      console.error('Fetch error:', err);
      if (err.response?.status === 403) {
        setError(t('accessDeniedOnlyOwners'));
      } else {
        setError(err.response?.data?.error || t('failedToLoadStaff'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStaff();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      if (editingStaff) {
        const updateData = {
          name: formData.name,
          email: formData.email,
          role: formData.role,
          phone: formData.phone
        };
        if (formData.role === 'kitchen') {
          updateData.station_type = formData.station_type;
        }
        await API.put(`/auth/users/${editingStaff.id}`, updateData);
        alert(t('staffUpdatedSuccessfully'));
      } else {
        if (formData.password.length < 6) {
          setError(t('passwordMinLength'));
          return;
        }
        const signupData = {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.role,
          phone: formData.phone
        };
        if (formData.role === 'kitchen') {
          signupData.station_type = formData.station_type;
        }
        await API.post('/auth/signup', signupData);
        alert(t('staffCreatedSuccessfully'));
      }
      resetModal();
      fetchStaff();
    } catch (err) {
      console.error('Save error:', err);
      setError(err.response?.data?.error || t('failedToSaveStaff'));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('deleteStaffConfirm'))) {
      try {
        await API.delete(`/auth/users/${id}`);
        alert(t('staffDeletedSuccessfully'));
        fetchStaff();
      } catch (err) {
        console.error('Delete error:', err);
        setError(err.response?.data?.error || t('failedToDeleteStaff'));
      }
    }
  };

  const resetModal = () => {
    setShowModal(false);
    setEditingStaff(null);
    setFormData({ name: '', email: '', password: '', role: 'cashier', phone: '', station_type: 'kitchen' });
    setError('');
  };

  const getRoleColor = (role) => {
    const colors = {
      owner: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
      admin: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
      manager: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
      cashier: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
      waiter: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
      kitchen: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
      bar: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400',
      both: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400',
      staff: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
    };
    return colors[role?.toLowerCase()] || colors.staff;
  };

  const getRoleIcon = (role) => {
    if (role === 'kitchen') return <ChefHat size={14} className="inline mr-1" />;
    if (role === 'bar') return <Wine size={14} className="inline mr-1" />;
    if (role === 'both') return <Layers size={14} className="inline mr-1" />;
    return null;
  };

  const getStationDisplay = (member) => {
    if (member.role === 'both') return String.fromCodePoint(0x1F373, 0x1F37A) + ' Both Stations';
    if (member.role === 'bar') return String.fromCodePoint(0x1F37A) + ' Bar';
    if (member.role === 'kitchen') {
      const stationMap = {
        kitchen: String.fromCodePoint(0x1F373) + ' Kitchen Only',
        bar: String.fromCodePoint(0x1F37A) + ' Bar Only',
        both: String.fromCodePoint(0x1F373, 0x1F37A) + ' Both Stations'
      };
      return stationMap[member.station_type] || String.fromCodePoint(0x1F373) + ' Kitchen Only';
    }
    return '-';
  };

  const getStatusBadge = (status, isActive) => {
    if (status === 'pending') {
      return <span className="ml-2 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-full text-xs">{t('pending')}</span>;
    }
    if (isActive === false || status === 'inactive') {
      return <span className="ml-2 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs">{t('inactive')}</span>;
    }
    return <span className="ml-2 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs">{t('active')}</span>;
  };

  const filteredStaff = staff.filter(s =>
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.role?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('staffManagement')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('manageStaffAccountsAndPermissions')}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-xl font-semibold flex items-center gap-2 transition"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            {t('refresh')}
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-semibold flex items-center gap-2 transition"
          >
            <Plus size={18} /> {t('addStaff')}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-3 text-center border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('totalStaff')}</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{staff.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-3 text-center border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('active')}</p>
          <p className="text-xl font-bold text-green-600 dark:text-green-400">{staff.filter(s => s.status === 'active' || s.is_active === true).length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-3 text-center border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('pending')}</p>
          <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{staff.filter(s => s.status === 'pending').length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-3 text-center border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('roles')}</p>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{new Set(staff.map(s => s.role)).size}</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400" size={18} />
        <input
          type="text"
          placeholder={`${t('search')} ${t('staff')}...`}
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

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-6 py-3 text-left text-gray-600 dark:text-gray-400 text-sm font-semibold">{t('name')}</th>
                <th className="px-6 py-3 text-left text-gray-600 dark:text-gray-400 text-sm font-semibold">{t('email')}</th>
                <th className="px-6 py-3 text-left text-gray-600 dark:text-gray-400 text-sm font-semibold">{t('role')}</th>
                <th className="px-6 py-3 text-left text-gray-600 dark:text-gray-400 text-sm font-semibold">{t('station')}</th>
                <th className="px-6 py-3 text-left text-gray-600 dark:text-gray-400 text-sm font-semibold">{t('phone')}</th>
                <th className="px-6 py-3 text-left text-gray-600 dark:text-gray-400 text-sm font-semibold">{t('status')}</th>
                <th className="px-6 py-3 text-left text-gray-600 dark:text-gray-400 text-sm font-semibold">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    <Users size={40} className="mx-auto mb-3 text-gray-400" />
                    {t('noStaffMembersFound')}
                    <p className="text-sm text-gray-400 mt-1">{t('clickAddStaffToCreate')}</p>
                  </td>
                </tr>
              ) : (
                filteredStaff.map(member => (
                  <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                    <td className="px-6 py-4">
                      <span className="text-gray-900 dark:text-white font-medium">{member.name}</span>
                    </td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300 text-sm">{member.email}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-lg text-xs font-semibold capitalize flex items-center gap-1 ${getRoleColor(member.role)}`}>
                        {getRoleIcon(member.role)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs">
                        {getStationDisplay(member)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300 text-sm">{member.phone || '-'}</td>
                    <td className="px-6 py-4">
                      {getStatusBadge(member.status, member.is_active)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingStaff(member);
                            setFormData({
                              name: member.name,
                              email: member.email,
                              password: '',
                              role: member.role,
                              phone: member.phone || '',
                              station_type: member.station_type || 'kitchen'
                            });
                            setShowModal(true);
                          }}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-700 transition"
                          title={t('edit')}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(member.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-700 transition"
                          title={t('delete')}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editingStaff ? t('editStaffMember') : t('addNewStaffMember')}
                </h2>
                <button onClick={resetModal} className="text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
                  <X size={20} />
                </button>
              </div>

              {error && (
                <div className="mb-4 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('fullName')} *</label>
                  <input
                    type="text"
                    placeholder={t('enterFullName')}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('emailAddress')} *</label>
                  <input
                    type="email"
                    placeholder={t('enterEmailAddress')}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                {!editingStaff && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('password')} *</label>
                    <input
                      type="password"
                      placeholder={t('minimum6Characters')}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('passwordMinLengthHint')}</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('role')} *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => {
                      const newRole = e.target.value;
                      setFormData({ 
                        ...formData, 
                        role: newRole,
                        station_type: newRole === 'kitchen' ? formData.station_type : 'kitchen'
                      });
                    }}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="owner">{t('owner')} ({t('fullAccess')})</option>
                    <option value="manager">{t('manager')} ({t('operationalAccess')})</option>
                    <option value="cashier">{t('cashier')} ({t('paymentOnly')})</option>
                    <option value="waiter">{t('waiter')} ({t('orderTaking')})</option>
                    <option value="kitchen">{String.fromCodePoint(0x1F373)} {t('kitchen')} (Food Prep)</option>
                    <option value="bar">{String.fromCodePoint(0x1F37A)} Bar (Drinks Only)</option>
                    <option value="both">{String.fromCodePoint(0x1F373, 0x1F37A)} Both Stations (Food & Drinks)</option>
                  </select>
                </div>

                {formData.role === 'kitchen' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Kitchen Staff Type
                    </label>
                    <select
                      value={formData.station_type}
                      onChange={(e) => setFormData({ ...formData, station_type: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="kitchen">{String.fromCodePoint(0x1F373)} Kitchen Only (Food orders only)</option>
                      <option value="bar">{String.fromCodePoint(0x1F37A)} Bar Only (Drink orders only)</option>
                      <option value="both">{String.fromCodePoint(0x1F373, 0x1F37A)} Both Stations (Food & Drink orders)</option>
                    </select>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {formData.station_type === 'kitchen' && 'This staff member will only see food orders'}
                      {formData.station_type === 'bar' && 'This staff member will only see drink orders'}
                      {formData.station_type === 'both' && 'This staff member will see both food and drink orders'}
                    </p>
                  </div>
                )}

                {formData.role === 'bar' && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                    <p className="text-blue-700 dark:text-blue-400 text-sm flex items-center gap-2">
                      <Wine size={16} />
                      Bar staff will only see drink orders in their dashboard
                    </p>
                  </div>
                )}

                {formData.role === 'both' && (
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
                    <p className="text-purple-700 dark:text-purple-400 text-sm flex items-center gap-2">
                      <Layers size={16} />
                      Both Stations staff can see and manage ALL orders (Food + Drinks)
                    </p>
                  </div>
                )}

                  <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800">
                    <p className="text-indigo-700 dark:text-indigo-400 text-sm flex items-center gap-2">
                      <Users size={16} />
                      Order Taker can take orders for all tables from a central station. No payment processing.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('phoneNumber')}</label>
                  <input
                    type="tel"
                    placeholder={t('optional')}
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="submit" className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition">
                    {editingStaff ? t('updateStaff') : t('createStaff')}
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

export default Staff;
