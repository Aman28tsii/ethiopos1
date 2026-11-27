import React, { useState, useEffect } from 'react';
import API from '../api/axios';
import { 
    Package, Plus, Edit2, Trash2, Search, X, UtensilsCrossed,
    Loader2, CheckCircle, AlertCircle, Info
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import RecipeManager from '../components/RecipeManager';
import { formatCurrency } from '../utils/formatting';
import { getProductEmoji } from '../utils/emojiMap';

// ============================================
// PRODUCT CARD COMPONENT
// ============================================
const ProductCard = ({ product, onEdit, onDelete, onRecipe, hasRecipe }) => {
    const { t } = useLanguage();

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:border-emerald-500/50 transition-all shadow-sm hover:shadow-md">
            <div className="h-32 bg-gray-100 dark:bg-gray-800/50 flex items-center justify-center relative">
                <span className="text-6xl">{getProductEmoji(product.category)}</span>
                {hasRecipe ? (
                    <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                        <CheckCircle size={12} />
                        Recipe ✓
                    </div>
                ) : (
                    <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 animate-pulse">
                        <AlertCircle size={12} />
                        No Recipe!
                    </div>
                )}
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
                        className={"px-2 py-1 rounded-full text-xs font-semibold " + (product.is_available ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400')}
                    >
                        {product.is_available ? 'Available' : 'Unavailable'}
                    </button>
                </div>
                
                <p className="text-emerald-600 dark:text-emerald-400 font-bold text-xl">{formatCurrency(product.price)}</p>
                
                <div className="flex gap-2 mt-4">
                    <button
                        onClick={() => onRecipe(product)}
                        className={"flex-1 py-2 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-1 " + (hasRecipe ? 'bg-orange-600 hover:bg-orange-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white animate-pulse')}
                    >
                        <UtensilsCrossed size={14} />
                        {hasRecipe ? 'Recipe' : 'Add Recipe!'}
                    </button>
                    <button
                        onClick={() => onEdit(product)}
                        className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-1"
                    >
                        <Edit2 size={14} />
                        Edit
                    </button>
                    <button
                        onClick={() => onDelete(product.id)}
                        className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-1"
                    >
                        <Trash2 size={14} />
                        Delete
                    </button>
                </div>
                
                {!hasRecipe && (
                    <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                        <AlertCircle size={12} />
                        ⚠️ Product needs recipe to deduct stock!
                    </p>
                )}
            </div>
        </div>
    );
};

// ============================================
// MAIN PRODUCTS COMPONENT
// ============================================
const Products = () => {
    const { t } = useLanguage();
    
    // ============================================
    // STATE
    // ============================================
    const [products, setProducts] = useState([]);
    const [recipes, setRecipes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [showRecipeManager, setShowRecipeManager] = useState(false);
    const [selectedProductForRecipe, setSelectedProductForRecipe] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // ============================================
    // PRODUCT FORM STATE
    // ============================================
    const [formData, setFormData] = useState({
        name: '',
        price: 0,
        category: '',
        description: '',
        is_available: true
    });

    // ============================================
    // FETCH DATA
    // ============================================
    const fetchData = async () => {
        setLoading(true);
        try {
            const [productsRes, recipesRes] = await Promise.all([
                API.get('/products'),
                API.get('/recipes')
            ]);
            setProducts(productsRes.data.data || []);
            setRecipes(recipesRes.data.data || []);
        } catch (err) {
            console.error('Fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // ============================================
    // CHECK IF PRODUCT HAS RECIPE
    // ============================================
    const hasRecipe = (productId) => {
        return recipes.some(r => r.product_id === productId);
    };

    // ============================================
    // HANDLERS
    // ============================================
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        
        try {
            let response;
            if (editingProduct) {
                response = await API.put(/products/, formData);
                alert('Product updated successfully!');
                resetModal();
                fetchData();
            } else {
                response = await API.post('/products', formData);
                alert('Product created successfully!');
                const newProduct = response.data.data;
                resetModal();
                setSelectedProductForRecipe(newProduct);
                setShowRecipeManager(true);
                fetchData();
            }
        } catch (err) {
            console.error('Save error:', err);
            alert(err.response?.data?.error || 'Failed to save');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this product?')) {
            try {
                await API.delete(/products/);
                alert('Product deleted successfully');
                fetchData();
            } catch (err) {
                alert(err.response?.data?.error || 'Failed to delete');
            }
        }
    };

    const handleEdit = (product) => {
        setEditingProduct(product);
        setFormData({
            name: product.name,
            price: product.price,
            category: product.category || '',
            description: product.description || '',
            is_available: product.is_available
        });
        setShowModal(true);
    };

    const openRecipeManager = (product) => {
        setSelectedProductForRecipe(product);
        setShowRecipeManager(true);
    };

    const resetModal = () => {
        setShowModal(false);
        setEditingProduct(null);
        setFormData({
            name: '',
            price: 0,
            category: '',
            description: '',
            is_available: true
        });
    };

    // ============================================
    // FILTERS
    // ============================================
    const categories = ['all', ...new Set(products.map(p => p.category).filter(Boolean))];
    
    const filteredProducts = products.filter(product => {
        const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
        const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    const productsWithoutRecipe = products.filter(p => !hasRecipe(p.id));

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
            {/* ============================================ */}
            {/* HEADER */}
            {/* ============================================ */}
            <div className="flex justify-between items-center flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Package size={24} className="text-emerald-600 dark:text-emerald-400" />
                        Products
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                        Manage your menu items. Every product needs a recipe.
                    </p>
                </div>
                <div className="flex gap-3">
                    {productsWithoutRecipe.length > 0 && (
                        <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-3 py-2 rounded-xl text-sm flex items-center gap-2">
                            <AlertCircle size={16} />
                            {productsWithoutRecipe.length} product{productsWithoutRecipe.length > 1 ? 's' : ''} need recipe!
                        </div>
                    )}
                    <button
                        onClick={() => {
                            setEditingProduct(null);
                            setShowModal(true);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-semibold flex items-center gap-2 transition"
                    >
                        <Plus size={18} />
                        Add Product
                    </button>
                </div>
            </div>

            {/* ============================================ */}
            {/* WARNING: PRODUCTS WITHOUT RECIPES */}
            {/* ============================================ */}
            {productsWithoutRecipe.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                        <AlertCircle size={20} className="text-red-600 dark:text-red-400 mt-0.5" />
                        <div>
                            <p className="text-red-700 dark:text-red-400 font-semibold">
                                ⚠️ {productsWithoutRecipe.length} product{productsWithoutRecipe.length > 1 ? 's' : ''} without recipe!
                            </p>
                            <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                                Products without recipes will NOT deduct stock when ordered.
                                Please add recipes to all products.
                            </p>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {productsWithoutRecipe.slice(0, 5).map(p => (
                                    <span key={p.id} className="bg-red-100 dark:bg-red-800/50 text-red-700 dark:text-red-300 px-2 py-1 rounded-lg text-xs">
                                        {p.name}
                                    </span>
                                ))}
                                {productsWithoutRecipe.length > 5 && (
                                    <span className="text-xs text-gray-500">+{productsWithoutRecipe.length - 5} more</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================ */}
            {/* CATEGORY FILTER */}
            {/* ============================================ */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                {categories.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={"px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition " + (selectedCategory === cat ? 'bg-emerald-600 text-white shadow-lg' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600')}
                    >
                        {cat === 'all' ? 'All Items' : cat}
                    </button>
                ))}
            </div>

            {/* ============================================ */}
            {/* SEARCH */}
            {/* ============================================ */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400" size={18} />
                <input
                    type="text"
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white pl-10 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                        <X size={18} className="text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                    </button>
                )}
            </div>

            {/* ============================================ */}
            {/* PRODUCTS GRID */}
            {/* ============================================ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredProducts.map(product => (
                    <ProductCard
                        key={product.id}
                        product={product}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onRecipe={openRecipeManager}
                        hasRecipe={hasRecipe(product.id)}
                    />
                ))}
            </div>

            {filteredProducts.length === 0 && (
                <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                    <Package size={48} className="mx-auto text-gray-500 dark:text-gray-400 mb-3" />
                    <p className="text-gray-500 dark:text-gray-400">No products found</p>
                    <button
                        onClick={() => {
                            setEditingProduct(null);
                            setShowModal(true);
                        }}
                        className="mt-4 text-emerald-600 dark:text-emerald-400 hover:text-blue-700 dark:hover:text-blue-300"
                    >
                        Add your first product
                    </button>
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
                        setShowRecipeManager(false);
                        setSelectedProductForRecipe(null);
                        fetchData();
                    }}
                    onClose={() => {
                        setShowRecipeManager(false);
                        setSelectedProductForRecipe(null);
                    }}
                />
            )}

            {/* ============================================ */}
            {/* ADD/EDIT PRODUCT MODAL */}
            {/* ============================================ */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
                        {/* Header */}
                        <div className="sticky top-0 bg-white dark:bg-gray-800 p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                {editingProduct ? 'Edit Product' : 'Add New Product'}
                            </h2>
                            <button onClick={resetModal} className="text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                <X size={24} />
                            </button>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="p-5 space-y-4">
                            {/* Product Name */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Name *
                                    <span className="text-xs text-gray-400 ml-2">(e.g., Doro Wat, Tibs)</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    placeholder="Enter product name"
                                />
                            </div>

                            {/* Category */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                                <select
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                >
                                    <option value="">Select category</option>
                                    <option value="Main Course">{String.fromCodePoint(0x1F35B)} Main Course</option>
                                    <option value="Beverage">{String.fromCodePoint(0x1F964)} Beverage</option>
                                    <option value="Coffee">{String.fromCodePoint(0x2615)} Coffee</option>
                                    <option value="Tea">{String.fromCodePoint(0x1F375)} Tea</option>
                                    <option value="Dessert">{String.fromCodePoint(0x1F370)} Dessert</option>
                                    <option value="Appetizer">{String.fromCodePoint(0x1F362)} Appetizer</option>
                                    <option value="Soup">{String.fromCodePoint(0x1F372)} Soup</option>
                                    <option value="Salad">🥗 Salad</option>
                                    <option value="Breakfast">{String.fromCodePoint(0x1F373)} Breakfast</option>
                                    <option value="Traditional">🇪🇹 Traditional</option>
                                    <option value="Side">🥗 Side</option>
                                    <option value="Vegetarian">🥬 Vegetarian</option>
                                </select>
                            </div>

                            {/* Price */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Price * (ETB)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    required
                                    value={formData.price}
                                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    placeholder="0.00"
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                                <textarea
                                    rows="3"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    placeholder="Describe your product..."
                                />
                            </div>

                            {/* Available */}
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="is_available"
                                    checked={formData.is_available}
                                    onChange={(e) => setFormData({ ...formData, is_available: e.target.checked })}
                                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-emerald-600 focus:ring-emerald-500"
                                />
                                <label htmlFor="is_available" className="text-sm text-gray-700 dark:text-gray-300">
                                    Available for sale
                                </label>
                            </div>

                            {/* Info: Recipe Required */}
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                                <p className="text-blue-700 dark:text-emerald-400 text-sm flex items-start gap-2">
                                    <Info size={16} className="mt-0.5 flex-shrink-0" />
                                    <span>
                                        <strong>Recipe Required:</strong> After creating this product, 
                                        you will be prompted to add a recipe with ingredients, 
                                        wastage %, and cooking loss %.
                                    </span>
                                </p>
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-3 pt-4">
                                <button 
                                    type="submit" 
                                    disabled={isSubmitting}
                                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isSubmitting && <Loader2 className="animate-spin" size={18} />}
                                    {editingProduct ? 'Update Product' : 'Create Product'}
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
        </div>
    );
};

export default Products;
