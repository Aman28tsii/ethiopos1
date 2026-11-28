// client/src/pages/owner/Categories.js
import React, { useState, useEffect } from 'react';
import API from '../../api/axios';
import { 
  Plus, Edit2, Trash2, X, Loader2, RefreshCw,
  FolderTree, Eye, Package, Tag
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const Categories = () => {
  const { t } = useLanguage();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [notification, setNotification] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryProducts, setCategoryProducts] = useState([]);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#6B7280',
    icon: String.fromCodePoint(0x1F37D)
  });

  const colorOptions = [
    { value: '#EF4444', label: 'Red' },
    { value: '#3B82F6', label: 'Blue' },
    { value: '#10B981', label: 'Green' },
    { value: '#F59E0B', label: 'Yellow' },
    { value: '#8B5CF6', label: 'Purple' },
    { value: '#EC4899', label: 'Pink' },
    { value: '#F97316', label: 'Orange' },
    { value: '#6B7280', label: 'Gray' }
  ];

  const iconOptions = [0x1F37D, 0x1F964, 0x1F362, 0x1F957, 0x1F370, 0x1F373, 0x1F372, 0x1F1EA, 0x1F355, 0x1F354, 0x1F35F, 0x1F32E, 0x1F9C3, 0x2615, 0x1F375].map(c => String.fromCodePoint(c));

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const response = await API.get('/categories/with-count');
      setCategories(response.data.data || []);
    } catch (err) {
      console.error('Fetch categories error:', err);
      setNotification('Failed to load categories');
      setTimeout(() => setNotification(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategoryProducts = async (categoryId) => {
    try {
      const response = await API.get(`/categories/${categoryId}/products`);
      setCategoryProducts(response.data.data || []);
      setSelectedCategory(categories.find(c => c.id === categoryId));
    } catch (err) {
      console.error('Fetch category products error:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingCategory) {
        await API.put(`/categories/${editingCategory.id}`, formData);
        setNotification('Category updated successfully!');
      } else {
        await API.post('/categories', formData);
        setNotification('Category created successfully!');
      }
      resetModal();
      fetchCategories();
      setTimeout(() => setNotification(''), 3000);
    } catch (err) {
      console.error('Save error:', err);
      setNotification(err.response?.data?.error || 'Failed to save category');
      setTimeout(() => setNotification(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (category) => {
    if (category.product_count > 0) {
      alert(`Cannot delete "${category.name}" because it has ${category.product_count} products assigned.`);
      return;
    }
    
    if (window.confirm(`Are you sure you want to delete category "${category.name}"?`)) {
      try {
        await API.delete(`/categories/${category.id}`);
        setNotification(`Category "${category.name}" deleted successfully`);
        fetchCategories();
        setTimeout(() => setNotification(''), 3000);
      } catch (err) {
        setNotification(err.response?.data?.error || 'Failed to delete category');
        setTimeout(() => setNotification(''), 3000);
      }
    }
  };

  const resetModal = () => {
    setShowModal(false);
    setEditingCategory(null);
    setFormData({ name: '', description: '', color: '#6B7280', icon: String.fromCodePoint(0x1F37D) });
  };

  const formatCurrency = (value) => {
    return `Br ${parseFloat(value || 0).toFixed(2)}`;
  };

  if (loading && categories.length === 0) {
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Product Categories</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Organize your products into categories for better management</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchCategories}
            className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-xl flex items-center gap-2 transition"
          >
            <RefreshCw size={18} />
            Refresh
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition"
          >
            <Plus size={18} aria-label="Add new item" />
            Add Category
          </button>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`rounded-xl p-3 text-center ${
          notification.includes('success') || notification.includes('updated') || notification.includes('created')
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
        }`}>
          {notification}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center border border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400 text-sm">Total Categories</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{categories.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center border border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400 text-sm">Total Products</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {categories.reduce((sum, c) => sum + (c.product_count || 0), 0)}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center border border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400 text-sm">Available Products</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {categories.reduce((sum, c) => sum + (c.available_products || 0), 0)}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center border border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400 text-sm">Uncategorized Products</p>
          <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {categories.reduce((sum, c) => sum + (c.product_count || 0) - (c.available_products || 0), 0)}
          </p>
        </div>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {categories.map(category => (
          <div 
            key={category.id} 
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:border-blue-500/50 transition-all shadow-sm hover:shadow-md"
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-700" style={{ borderTop: `4px solid ${category.color || String.fromCodePoint(0x1F37D)}` }}>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{category.icon || String.fromCodePoint(0x1F37D)}</span>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">{category.name}</h3>
                    {category.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[150px]">{category.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setEditingCategory(category);
                      setFormData({
                        name: category.name,
                        description: category.description || '',
                        color: category.color || '#6B7280',
                        icon: category.icon || '📁'
                      });
                      setShowModal(true);
                    }}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 transition p-1"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(category)}
                    className="text-red-600 dark:text-red-400 hover:text-red-700 transition p-1"
                    disabled={category.product_count > 0}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
            <div className="p-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-sm">
                  <Package size={14} className="text-gray-400" />
                  <span className="text-gray-600 dark:text-gray-300">
                    {category.product_count || 0} products
                  </span>
                  <span className="text-green-600 dark:text-green-400 text-xs">
                    ({category.available_products || 0} available)
                  </span>
                </div>
                <button
                  onClick={() => fetchCategoryProducts(category.id)}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-700 text-sm flex items-center gap-1"
                >
                  <Eye size={14} />
                  View
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {categories.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <FolderTree size={48} className="mx-auto text-gray-400 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No categories found</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 text-blue-600 dark:text-blue-400 hover:text-blue-700"
          >
            Add your first category
          </button>
        </div>
      )}

      {/* Category Products Modal */}
      {selectedCategory && categoryProducts.length > 0 && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="sticky top-0 bg-white dark:bg-gray-800 p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{selectedCategory.icon || String.fromCodePoint(0x1F37D)}</span>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selectedCategory.name}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{categoryProducts.length} products</p>
                </div>
              </div>
              <button onClick={() => { setSelectedCategory(null); setCategoryProducts([]); }} className="text-gray-500 hover:text-gray-600">
                <X size={24} aria-label="Close" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {categoryProducts.map(product => (
                  <div key={product.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{product.name}</p>
                      <p className="text-sm text-green-600 dark:text-green-400">{formatCurrency(product.price)}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${product.is_available ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                      {product.is_available ? 'Available' : 'Unavailable'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Category Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full border border-gray-200 dark:border-gray-700">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {editingCategory ? 'Edit Category' : 'Add New Category'}
              </h2>
              <button onClick={resetModal} className="text-gray-500 dark:text-gray-400 hover:text-gray-600">
                <X size={24} aria-label="Close" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Main Course, Beverage"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea
                  rows="2"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Brief description of this category"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Color</label>
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map(color => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, color: color.value })}
                      className={`w-8 h-8 rounded-full border-2 transition ${
                        formData.color === color.value ? 'border-blue-500 scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.label}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Icon</label>
                <div className="flex flex-wrap gap-2">
                  {iconOptions.map(icon => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setFormData({ ...formData, icon: icon })}
                      className={`w-10 h-10 rounded-lg text-xl border-2 transition ${
                        formData.icon === icon ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-transparent hover:border-gray-300'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button type="submit" disabled={loading} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition disabled:opacity-50">
                  {editingCategory ? 'Update' : 'Create'}
                </button>
                <button type="button" onClick={resetModal} className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-semibold transition">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Categories;