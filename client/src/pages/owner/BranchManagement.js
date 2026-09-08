// client/src/pages/owner/BranchManagement.js

import React, { useState, useEffect } from 'react';
import { 
    Building2, Plus, Edit2, Trash2, X, Loader2, 
    RefreshCw, CheckCircle, AlertCircle, MapPin, Phone
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useBranch } from '../../context/BranchContext';
import { getBranches, createBranch, updateBranch, deleteBranch } from '../../api/branches';

const BranchManagement = () => {
    const { t } = useLanguage();
    const { selectedBranch, refreshBranches } = useBranch();
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingBranch, setEditingBranch] = useState(null);
    const [notification, setNotification] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        address: '',
        phone: ''
    });
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    useEffect(() => {
        fetchBranches();
    }, []);

    const fetchBranches = async () => {
        setLoading(true);
        try {
            const response = await getBranches();
            setBranches(response.data || []);
        } catch (err) {
            console.error('Fetch branches error:', err);
            setNotification({ type: 'error', message: err.response?.data?.error || 'Failed to load branches' });
            setTimeout(() => setNotification(null), 5000);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (editingBranch) {
                await updateBranch(editingBranch.id, formData);
                setNotification({ type: 'success', message: `Branch "${formData.name}" updated successfully` });
            } else {
                await createBranch(formData);
                setNotification({ type: 'success', message: `Branch "${formData.name}" created successfully` });
                // Refresh branch selector context
                await refreshBranches();
            }
            resetModal();
            fetchBranches();
            setTimeout(() => setNotification(null), 5000);
        } catch (err) {
            console.error('Save branch error:', err);
            setNotification({ type: 'error', message: err.response?.data?.error || 'Failed to save branch' });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        setLoading(true);
        try {
            await deleteBranch(deleteConfirm.id);
            setNotification({ type: 'success', message: `Branch "${deleteConfirm.name}" deleted successfully` });
            setDeleteConfirm(null);
            fetchBranches();
            // Refresh branch selector context
            await refreshBranches();
            setTimeout(() => setNotification(null), 5000);
        } catch (err) {
            console.error('Delete branch error:', err);
            setNotification({ type: 'error', message: err.response?.data?.error || 'Failed to delete branch' });
            setDeleteConfirm(null);
        } finally {
            setLoading(false);
        }
    };

    const resetModal = () => {
        setShowModal(false);
        setEditingBranch(null);
        setFormData({ name: '', address: '', phone: '' });
    };

    const openCreateModal = () => {
        setEditingBranch(null);
        setFormData({ name: '', address: '', phone: '' });
        setShowModal(true);
    };

    const openEditModal = (branch) => {
        setEditingBranch(branch);
        setFormData({
            name: branch.name,
            address: branch.address || '',
            phone: branch.phone || ''
        });
        setShowModal(true);
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString() + ' ' + new Date(dateString).toLocaleTimeString();
    };

    if (loading && branches.length === 0) {
        return (
            <div className="flex justify-center items-center h-full min-h-[400px]">
                <Loader2 className="animate-spin text-blue-500" size={40} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Building2 size={24} className="text-blue-600 dark:text-blue-400" />
                        Branch Management
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                        Manage the branches belonging to your company
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={fetchBranches}
                        className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-xl flex items-center gap-2 transition"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                    <button
                        onClick={openCreateModal}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition"
                    >
                        <Plus size={18} />
                        Add Branch
                    </button>
                </div>
            </div>

            {/* Notification */}
            {notification && (
                <div className={`rounded-xl p-4 flex items-center gap-3 ${
                    notification.type === 'success' 
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
                }`}>
                    {notification.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                    <span>{notification.message}</span>
                    <button onClick={() => setNotification(null)} className="ml-auto">
                        <X size={18} />
                    </button>
                </div>
            )}

            {/* Current Branch Indicator */}
            {selectedBranch && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 flex items-center gap-2 text-blue-700 dark:text-blue-400 text-sm">
                    <Building2 size={16} />
                    <span className="font-semibold">Currently viewing:</span>
                    <span>{selectedBranch.name}</span>
                </div>
            )}

            {/* Branches Grid */}
            {branches.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center border border-gray-200 dark:border-gray-700">
                    <Building2 size={48} className="mx-auto text-gray-400 mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 text-lg">No branches found</p>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Click "Add Branch" to create your first branch</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {branches.map((branch) => (
                        <div key={branch.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:border-blue-500/50 transition-all shadow-sm hover:shadow-md">
                            <div className="p-5">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                            <Building2 size={20} className="text-blue-600 dark:text-blue-400" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-900 dark:text-white text-lg">{branch.name}</h3>
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                                                branch.is_active !== false
                                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                            }`}>
                                                {branch.is_active !== false ? 'Active' : 'Inactive'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => openEditModal(branch)}
                                            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition p-1"
                                            title="Edit branch"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => setDeleteConfirm({ id: branch.id, name: branch.name })}
                                            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition p-1"
                                            title="Delete branch"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2 text-sm">
                                    {branch.address && (
                                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                            <MapPin size={14} />
                                            <span>{branch.address}</span>
                                        </div>
                                    )}
                                    {branch.phone && (
                                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                            <Phone size={14} />
                                            <span>{branch.phone}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-500 text-xs mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                                        <span>ID: {branch.id}</span>
                                        <span>•</span>
                                        <span>Created: {formatDate(branch.created_at)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Branch Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 shadow-xl">
                        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Building2 size={20} className="text-blue-600 dark:text-blue-400" />
                                {editingBranch ? 'Edit Branch' : 'Add New Branch'}
                            </h2>
                            <button onClick={resetModal} className="text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-5 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Branch Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g., Bole Branch"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Address
                                </label>
                                <input
                                    type="text"
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Bole, Addis Ababa"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Phone
                                </label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="+251-XXX-XXX-XXX"
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {loading && <Loader2 className="animate-spin" size={18} />}
                                    {editingBranch ? 'Update Branch' : 'Create Branch'}
                                </button>
                                <button
                                    type="button"
                                    onClick={resetModal}
                                    className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-semibold transition"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 shadow-xl">
                        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2 text-red-600 dark:text-red-400">
                                <Trash2 size={20} />
                                Delete Branch
                            </h2>
                            <button onClick={() => setDeleteConfirm(null)} className="text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-5">
                            <p className="text-gray-700 dark:text-gray-300 text-center">
                                Are you sure you want to delete <strong className="text-gray-900 dark:text-white">"{deleteConfirm.name}"</strong>?
                            </p>
                            <p className="text-gray-500 dark:text-gray-400 text-sm text-center mt-2">
                                This will permanently remove the branch from your company.
                            </p>
                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={handleDelete}
                                    disabled={loading}
                                    className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {loading && <Loader2 className="animate-spin" size={18} />}
                                    Yes, Delete
                                </button>
                                <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-semibold transition"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BranchManagement;