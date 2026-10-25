import React, { useState, useEffect, useCallback, useMemo } from 'react';
import API from '../api/axios';
import { 
    Package, Plus, Edit2, Trash2, AlertTriangle, Search, X, Loader2,
    UtensilsCrossed, Wine, AlertCircle  // ★ Wine icon for bottle actions
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useDebounce } from '../hooks/useDebounce';
import RecipeManager from '../components/RecipeManager';

// ============================================
// HELPER: format bottle display for a row
// ============================================
const formatBottleDisplay = (ingredient) => {
    const size = parseFloat(ingredient.bottle_size_ml);
    const qty  = parseFloat(ingredient.quantity) || 0;

    if (!size || size <= 0) return null; // not a bottle ingredient

    const bottles = qty / size;
    return {
        bottles: bottles.toFixed(2),
        ml: qty.toFixed(0),
        size: size
    };
};

// ============================================
// INGREDIENT ROW COMPONENT
// ============================================
const IngredientRow = ({ ingredient, onEdit, onDelete, onMarkEmpty, onBrokenBottle, formatCurrency }) => {
    const { t } = useLanguage();
    const isLowStock = ingredient.quantity <= ingredient.min_stock;
    const bottleInfo = formatBottleDisplay(ingredient);
    
    return (
        <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
            <td className="px-6 py-4 text-gray-900 dark:text-white">{ingredient.name}</td>
            <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{ingredient.unit}</td>
            <td className="px-6 py-4">
                <span className={`font-semibold ${isLowStock ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {ingredient.quantity}
                </span>
                {ingredient.safety_stock > 0 && (
                    <span className="text-xs text-gray-500 ml-1">({t('safetyStock')}: {ingredient.safety_stock})</span>
                )}
            </td>
            {/* ★ NEW: Bottle column */}
            <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                {bottleInfo ? (
                    <div className="flex flex-col text-xs">
                        <span className="font-semibold text-purple-600 dark:text-purple-400">
                            {bottleInfo.bottles} bottles
                        </span>
                        <span className="text-gray-500">
                            ({bottleInfo.ml} ml / {bottleInfo.size} ml)
                        </span>
                    </div>
                ) : (
                    <span className="text-gray-400">—</span>
                )}
            </td>
            <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{ingredient.min_stock}</td>
            <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{formatCurrency(ingredient.unit_cost)}</td>
            <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{ingredient.category || '-'}</td>
            <td className="px-6 py-4">
                <div className="flex gap-2">
                    {/* ★ NEW: bottle action buttons (only if bottle ingredient) */}
                    {bottleInfo && (
                        <>
                            <button
                                onClick={() => onMarkEmpty(ingredient)}
                                className="text-amber-600 dark:text-amber-400 hover:text-amber-700 transition"
                                title="Mark bottle empty (reduce by 1 bottle)"
                            >
                                <Wine size={16} />
                            </button>
                            <button
                                onClick={() => onBrokenBottle(ingredient)}
                                className="text-orange-600 dark:text-orange-400 hover:text-orange-700 transition"
                                title="Record broken bottle"
                            >
                                <AlertCircle size={16} />
                            </button>
                        </>
                    )}
                    <button onClick={() => onEdit(ingredient, 'ingredient')} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 transition">
                        <Edit2 size={16} />
                    </button>
                    <button onClick={() => onDelete(ingredient.id, 'ingredient')} className="text-red-600 dark:text-red-400 hover:text-red-700 transition">
                        <Trash2 size={16} />
                    </button>
                </div>
            </td>
        </tr>
    );
};

// ============================================
// PRODUCT CARD COMPONENT
// ============================================
const ProductCard = ({ product, onEdit, onDelete, onRecipe, formatCurrency }) => {
    const { t } = useLanguage();
    
    const getCategoryEmoji = (category) => {
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
            'Vegetarian': '🥬'
        };
        return emojis[category] || '🍽️';
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:border-purple-500/50 transition-all shadow-sm hover:shadow-md">
            <div className="h-32 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center">
                <span className="text-6xl">{getCategoryEmoji(product.category)}</span>
            </div>
            
            <div className="p-4">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white text-lg truncate">{product.name}</h3>
                        {product.category && (
                            <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">{product.category}</p>
                        )}
                    </div>
                    <button
                        onClick={() => onEdit(product)}
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            product.is_available 
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        }`}
                    >
                        {product.is_available ? t('available') : t('unavailable')}
                    </button>
                </div>
                
                <p className="text-blue-600 dark:text-blue-400 font-bold text-xl">{formatCurrency(product.price)}</p>
                
                <div className="flex gap-2 mt-4">
                    <button
                        onClick={() => onRecipe(product)}
                        className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold transition flex items-center justify-center gap-1"
                    >
                        <UtensilsCrossed size={14} />
                        {t('recipe')}
                    </button>
                    <button
                        onClick={() => onEdit(product)}
                        className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-1"
                    >
                        <Edit2 size={14} />
                        {t('edit')}
                    </button>
                    <button
                        onClick={() => onDelete(product.id, 'product')}
                        className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-1"
                    >
                        <Trash2 size={14} />
                        {t('delete')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================
// MAIN INVENTORY COMPONENT
// ============================================
const Inventory = () => {
    const { t } = useLanguage();
    
    // State
    const [ingredients, setIngredients] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('ingredients');
    const [showModal, setShowModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showRecipeManager, setShowRecipeManager] = useState(false);
    const [selectedProductForRecipe, setSelectedProductForRecipe] = useState(null);
    const [editType, setEditType] = useState('ingredient');
    
    const debouncedSearchTerm = useDebounce(searchTerm, 300);
    
    // Form states
    const [ingredientForm, setIngredientForm] = useState({
        name: '',
        unit: '',
        quantity: 0,
        min_stock: 0,
        unit_cost: 0,
        category: '',
        supplier: '',
        bottle_size_ml: ''  // ★ NEW
    });
    
    const [productForm, setProductForm] = useState({
        name: '',
        price: 0,
        category: '',
        description: '',
        is_available: true
    });

    // ============================================
    // FETCH DATA
    // ============================================
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [ingredientsRes, productsRes] = await Promise.all([
                API.get('/ingredients'),
                API.get('/products')
            ]);
            setIngredients(ingredientsRes.data.data || []);
            setProducts(productsRes.data.data || []);
        } catch (err) {
            console.error('Fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // ============================================
    // FILTERS
    // ============================================
    const filteredIngredients = useMemo(() => {
        if (!debouncedSearchTerm) return ingredients;
        const searchLower = debouncedSearchTerm.toLowerCase();
        return ingredients.filter(i =>
            i.name.toLowerCase().includes(searchLower) ||
            (i.category && i.category.toLowerCase().includes(searchLower))
        );
    }, [ingredients, debouncedSearchTerm]);

    const filteredProducts = useMemo(() => {
        if (!debouncedSearchTerm) return products;
        const searchLower = debouncedSearchTerm.toLowerCase();
        return products.filter(p =>
            p.name.toLowerCase().includes(searchLower) ||
            (p.category && p.category.toLowerCase().includes(searchLower))
        );
    }, [products, debouncedSearchTerm]);

    const lowStockItems = useMemo(() => {
        return ingredients.filter(i => i.quantity <= i.min_stock);
    }, [ingredients]);

    // ============================================
    // HANDLERS
    // ============================================
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        
        try {
            if (editType === 'ingredient') {
                // ★ Clean payload: send bottle_size_ml only if it's a positive number
                const payload = { ...ingredientForm };
                if (payload.bottle_size_ml === '' || payload.bottle_size_ml === null) {
                    payload.bottle_size_ml = null;
                } else {
                    payload.bottle_size_ml = parseInt(payload.bottle_size_ml, 10);
                }

                if (editingItem) {
                    await API.put(`/ingredients/${editingItem.id}`, payload);
                } else {
                    await API.post('/ingredients', payload);
                }
            } else {
                if (editingItem) {
                    await API.put(`/products/${editingItem.id}`, productForm);
                } else {
                    await API.post('/products', productForm);
                }
            }
            resetModal();
            fetchData();
        } catch (err) {
            console.error('Save error:', err);
            alert(err.response?.data?.error || t('saveFailed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id, type) => {
        if (window.confirm(t('deleteConfirm'))) {
            try {
                if (type === 'ingredient') {
                    await API.delete(`/ingredients/${id}`);
                } else {
                    await API.delete(`/products/${id}`);
                }
                fetchData();
            } catch (err) {
                alert(err.response?.data?.error || t('deleteFailed'));
            }
        }
    };

    // ★ NEW: Mark bottle empty
    const handleMarkEmpty = async (ingredient) => {
        const size = parseFloat(ingredient.bottle_size_ml);
        const qty  = parseFloat(ingredient.quantity) || 0;
        const bottles = Math.floor(qty / size);

        if (bottles < 1) {
            alert('No whole bottles left to mark empty.');
            return;
        }

        const confirmMsg =
            `Mark 1 bottle of "${ingredient.name}" as empty?\n\n` +
            `This will reduce stock by ${size} ml.\n` +
            `Current: ${qty} ml (${(qty/size).toFixed(2)} bottles)\n` +
            `After:   ${qty - size} ml (${((qty-size)/size).toFixed(2)} bottles)`;

        if (!window.confirm(confirmMsg)) return;

        try {
            await API.post(`/ingredients/${ingredient.id}/mark-empty`);
            fetchData();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to mark bottle empty');
        }
    };

    // ★ NEW: Record broken bottle
    const handleBrokenBottle = async (ingredient) => {
        const size = parseFloat(ingredient.bottle_size_ml);
        const qty  = parseFloat(ingredient.quantity) || 0;
        const bottles = Math.floor(qty / size);

        if (bottles < 1) {
            alert('No whole bottles left to record as broken.');
            return;
        }

        const reason = window.prompt(
            `Record 1 bottle of "${ingredient.name}" as broken?\n\n` +
            `This will reduce stock by ${size} ml.\n\n` +
            `Optional reason (e.g., "dropped", "leaked"):`
        );
        if (reason === null) return; // cancelled

        try {
            await API.post(`/ingredients/${ingredient.id}/broken-bottle`, {
                reason: reason || 'Broken bottle'
            });
            fetchData();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to record broken bottle');
        }
    };

    const handleEdit = (item, type) => {
        setEditType(type);
        if (type === 'ingredient') {
            setIngredientForm({
                name: item.name,
                unit: item.unit,
                quantity: item.quantity,
                min_stock: item.min_stock,
                unit_cost: item.unit_cost,
                category: item.category || '',
                supplier: item.supplier || '',
                bottle_size_ml: item.bottle_size_ml || ''  // ★ NEW
            });
        } else {
            setProductForm({
                name: item.name,
                price: item.price,
                category: item.category || '',
                description: item.description || '',
                is_available: item.is_available
            });
        }
        setEditingItem(item);
        setShowModal(true);
    };

    const resetModal = () => {
        setShowModal(false);
        setEditingItem(null);
        setIsSubmitting(false);
        setIngredientForm({
            name: '',
            unit: '',
            quantity: 0,
            min_stock: 0,
            unit_cost: 0,
            category: '',
            supplier: '',
            bottle_size_ml: ''  // ★ NEW
        });
        setProductForm({
            name: '',
            price: 0,
            category: '',
            description: '',
            is_available: true
        });
    };

    const openRecipeManager = (product) => {
        setSelectedProductForRecipe(product);
        setShowRecipeManager(true);
    };

    const formatCurrency = (value) => {
        const num = parseFloat(value || 0);
        return `Br ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // ============================================
    // LOADING
    // ============================================
    if (loading) {
        return (
            <div className="flex justify-center items-center h-full">
                <Loader2 className="animate-spin text-blue-500" size={40} />
            </div>
        );
    }

    // ============================================
    // RENDER
    // ============================================
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {t('inventoryManagement')}
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                        {t('manageProductsAndIngredients')}
                    </p>
                </div>
                <button
                    onClick={() => {
                        setEditType(activeTab === 'ingredients' ? 'ingredient' : 'product');
                        setEditingItem(null);
                        setShowModal(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-semibold flex items-center gap-2 transition"
                >
                    <Plus size={18} />
                    {activeTab === 'ingredients' ? t('addIngredient') : t('addProduct')}
                </button>
            </div>

            {/* Low Stock Alert */}
            {lowStockItems.length > 0 && activeTab === 'ingredients' && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <AlertTriangle size={20} className="text-yellow-600 dark:text-yellow-500" />
                        <div>
                            <p className="text-yellow-700 dark:text-yellow-400 font-semibold">{t('lowStockAlert')}</p>
                            <p className="text-gray-600 dark:text-gray-400 text-sm">
                                {lowStockItems.length} {t('ingredientsBelowMinStock')}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* TABS */}
            <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
                <button
                    onClick={() => setActiveTab('ingredients')}
                    className={`px-6 py-3 font-semibold transition-all ${
                        activeTab === 'ingredients'
                            ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                >
                    🧂 {t('ingredients')}
                </button>
                <button
                    onClick={() => setActiveTab('products')}
                    className={`px-6 py-3 font-semibold transition-all ${
                        activeTab === 'products'
                            ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                >
                    🛒 {t('products')}
                </button>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400" size={18} />
                <input
                    type="text"
                    placeholder={`${t('search')} ${activeTab === 'ingredients' ? t('ingredients') : t('products')}...`}
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

            {/* ============================================ */}
            {/* INGREDIENTS TABLE */}
            {/* ============================================ */}
            {activeTab === 'ingredients' && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 dark:bg-gray-700/50">
                                <tr>
                                    <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm font-semibold">{t('name')}</th>
                                    <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm font-semibold">{t('unit')}</th>
                                    <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm font-semibold">{t('stock')}</th>
                                    {/* ★ NEW: Bottle column */}
                                    <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm font-semibold">Bottle</th>
                                    <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm font-semibold">{t('minStock')}</th>
                                    <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm font-semibold">{t('unitCost')}</th>
                                    <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm font-semibold">{t('category')}</th>
                                    <th className="px-6 py-3 text-gray-600 dark:text-gray-400 text-sm font-semibold">{t('actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {filteredIngredients.map(ing => (
                                    <IngredientRow
                                        key={ing.id}
                                        ingredient={ing}
                                        onEdit={(item) => handleEdit(item, 'ingredient')}
                                        onDelete={handleDelete}
                                        onMarkEmpty={handleMarkEmpty}      // ★ NEW
                                        onBrokenBottle={handleBrokenBottle} // ★ NEW
                                        formatCurrency={formatCurrency}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filteredIngredients.length === 0 && (
                        <div className="text-center py-12">
                            <Package size={48} className="mx-auto text-gray-500 dark:text-gray-400 mb-3" />
                            <p className="text-gray-500 dark:text-gray-400">{t('noIngredientsFound')}</p>
                        </div>
                    )}
                </div>
            )}

            {/* ============================================ */}
            {/* PRODUCTS GRID */}
            {/* ============================================ */}
            {activeTab === 'products' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filteredProducts.map(product => (
                        <ProductCard
                            key={product.id}
                            product={product}
                            onEdit={(item) => handleEdit(item, 'product')}
                            onDelete={handleDelete}
                            onRecipe={openRecipeManager}
                            formatCurrency={formatCurrency}
                        />
                    ))}
                </div>
            )}

            {activeTab === 'products' && filteredProducts.length === 0 && (
                <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                    <Package size={48} className="mx-auto text-gray-500 dark:text-gray-400 mb-3" />
                    <p className="text-gray-500 dark:text-gray-400">{t('noProductsFound')}</p>
                </div>
            )}

            {/* ============================================ */}
            {/* RECIPE MANAGER MODAL */}
            {/* ============================================ */}
            {showRecipeManager && selectedProductForRecipe && (
                <RecipeManager
                    productId={selectedProductForRecipe.id}
                    productName={selectedProductForRecipe.name}
                    productPrice={selectedProductForRecipe.price}
                    onSave={() => {
                        fetchData();
                        setShowRecipeManager(false);
                    }}
                    onClose={() => {
                        setShowRecipeManager(false);
                        setSelectedProductForRecipe(null);
                    }}
                />
            )}

            {/* ============================================ */}
            {/* ADD/EDIT MODAL */}
            {/* ============================================ */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
                        <div className="sticky top-0 bg-white dark:bg-gray-800 p-6 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex justify-between items-center">
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                    {editingItem ? `${t('edit')} ${editType === 'ingredient' ? t('ingredient') : t('product')}` : `${t('addNew')} ${editType === 'ingredient' ? t('ingredient') : t('product')}`}
                                </h2>
                                <button onClick={resetModal} className="text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                    <X size={24} />
                                </button>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {editType === 'ingredient' ? (
                                // INGREDIENT FORM
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('name')} *</label>
                                        <input
                                            type="text"
                                            required
                                            value={ingredientForm.name}
                                            onChange={(e) => setIngredientForm({ ...ingredientForm, name: e.target.value })}
                                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('category')}</label>
                                        <input
                                            type="text"
                                            value={ingredientForm.category}
                                            onChange={(e) => setIngredientForm({ ...ingredientForm, category: e.target.value })}
                                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            placeholder={t('egVegetables')}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('unit')} *</label>
                                        <select
                                            required
                                            value={ingredientForm.unit}
                                            onChange={(e) => setIngredientForm({ ...ingredientForm, unit: e.target.value })}
                                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="">{t('selectUnit')}</option>
                                            <option value="kg">{t('kilogram')}</option>
                                            <option value="g">{t('gram')}</option>
                                            <option value="L">{t('liter')}</option>
                                            <option value="ml">{t('milliliter')}</option>
                                            <option value="pcs">{t('pieces')}</option>
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('quantity')}</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={ingredientForm.quantity}
                                                onChange={(e) => setIngredientForm({ ...ingredientForm, quantity: parseFloat(e.target.value) || 0 })}
                                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('minStock')}</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={ingredientForm.min_stock}
                                                onChange={(e) => setIngredientForm({ ...ingredientForm, min_stock: parseFloat(e.target.value) || 0 })}
                                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('unitCost')}</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={ingredientForm.unit_cost}
                                                onChange={(e) => setIngredientForm({ ...ingredientForm, unit_cost: parseFloat(e.target.value) || 0 })}
                                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('supplier')}</label>
                                            <input
                                                type="text"
                                                value={ingredientForm.supplier}
                                                onChange={(e) => setIngredientForm({ ...ingredientForm, supplier: e.target.value })}
                                                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>
                                    {/* ★ NEW: Bottle size field */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                                            <Wine size={14} />
                                            Bottle Size (ml)
                                            <span className="text-xs text-gray-500 font-normal">— optional, for bar items</span>
                                        </label>
                                        <input
                                            type="number"
                                            step="1"
                                            min="0"
                                            placeholder="e.g., 750 for whisky, 330 for beer"
                                            value={ingredientForm.bottle_size_ml}
                                            onChange={(e) => setIngredientForm({ ...ingredientForm, bottle_size_ml: e.target.value })}
                                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            Leave empty for normal ingredients. Set to bottle volume in ml to track bottles remaining.
                                        </p>
                                    </div>
                                </>
                            ) : (
                                // PRODUCT FORM
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('name')} *</label>
                                        <input
                                            type="text"
                                            required
                                            value={productForm.name}
                                            onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('category')}</label>
                                        <select
                                            value={productForm.category}
                                            onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="">{t('selectCategory')}</option>
                                            <option value="Main Course">🍛 Main Course</option>
                                            <option value="Beverage">🥤 Beverage</option>
                                            <option value="Coffee">☕ Coffee</option>
                                            <option value="Tea">🍵 Tea</option>
                                            <option value="Dessert">🍰 Dessert</option>
                                            <option value="Appetizer">🍢 Appetizer</option>
                                            <option value="Soup">🍲 Soup</option>
                                            <option value="Salad">🥗 Salad</option>
                                            <option value="Breakfast">🍳 Breakfast</option>
                                            <option value="Traditional">🇪🇹 Traditional</option>
                                            <option value="Side">🥗 Side</option>
                                            <option value="Vegetarian">🥬 Vegetarian</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('price')} *</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            required
                                            value={productForm.price}
                                            onChange={(e) => setProductForm({ ...productForm, price: parseFloat(e.target.value) || 0 })}
                                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('description')}</label>
                                        <textarea
                                            rows="2"
                                            value={productForm.description}
                                            onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                                            className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="is_available"
                                            checked={productForm.is_available}
                                            onChange={(e) => setProductForm({ ...productForm, is_available: e.target.checked })}
                                            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                        />
                                        <label htmlFor="is_available" className="text-sm text-gray-700 dark:text-gray-300">
                                            {t('availableForSale')}
                                        </label>
                                    </div>
                                </>
                            )}

                            <div className="flex gap-3 pt-4">
                                <button type="submit" disabled={isSubmitting} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2">
                                    {isSubmitting && <Loader2 className="animate-spin" size={18} />}
                                    {editingItem ? t('update') : t('create')}
                                </button>
                                <button type="button" onClick={resetModal} className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-semibold transition">
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

export default Inventory;