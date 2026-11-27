import React, { useState, useEffect } from 'react';
import API from '../api/axios';
import { 
  UtensilsCrossed, Plus, Trash2, Edit2, Search, X, 
  DollarSign, TrendingUp, AlertCircle, CheckCircle 
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const Recipes = () => {
  const { t } = useLanguage();
  const [recipes, setRecipes] = useState([]);
  const [products, setProducts] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [costData, setCostData] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [recipeIngredients, setRecipeIngredients] = useState([]);
  const [selectedIngredient, setSelectedIngredient] = useState({ ingredient_id: '', quantity_required: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [recipesRes, productsRes, ingredientsRes] = await Promise.all([
        API.get('/recipes'),
        API.get('/products'),
        API.get('/ingredients')
      ]);
      setRecipes(recipesRes.data.data || []);
      setProducts(productsRes.data.data || []);
      setIngredients(ingredientsRes.data.data || []);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const viewRecipe = async (productId) => {
    try {
      const response = await API.get(`/recipes/product/${productId}`);
      setSelectedProduct(response.data.data);
      setRecipeIngredients(response.data.data.ingredients || []);
      setCostData(response.data.data);
      setShowModal(true);
    } catch (err) {
      console.error('View recipe error:', err);
      alert(err.response?.data?.error || t('failedToLoadRecipe'));
    }
  };

  const addIngredientToRecipe = () => {
    if (!selectedIngredient.ingredient_id || !selectedIngredient.quantity_required) {
      alert(t('pleaseSelectIngredientAndQuantity'));
      return;
    }
    
    const ingredient = ingredients.find(i => i.id === parseInt(selectedIngredient.ingredient_id));
    if (!ingredient) return;
    
    setRecipeIngredients(prev => [...prev, {
      ingredient_id: ingredient.id,
      ingredient_name: ingredient.name,
      quantity_required: parseFloat(selectedIngredient.quantity_required),
      unit: ingredient.unit,
      unit_cost: parseFloat(ingredient.unit_cost),
      cost_per_product: parseFloat(selectedIngredient.quantity_required) * parseFloat(ingredient.unit_cost)
    }]);
    
    setSelectedIngredient({ ingredient_id: '', quantity_required: '' });
  };

  const removeIngredientFromRecipe = (index) => {
    setRecipeIngredients(prev => prev.filter((_, i) => i !== index));
  };

  const saveRecipe = async () => {
    if (recipeIngredients.length === 0) {
      alert(t('pleaseAddAtLeastOneIngredient'));
      return;
    }
    
    try {
      const payload = {
        ingredients: recipeIngredients.map(ing => ({
          ingredient_id: ing.ingredient_id,
          quantity_required: ing.quantity_required
        }))
      };
      
      await API.post(`/recipes/product/${selectedProduct.product_id}`, payload);
      alert(t('recipeSavedSuccessfully'));
      setShowModal(false);
      fetchData();
    } catch (err) {
      console.error('Save recipe error:', err);
      alert(err.response?.data?.error || t('failedToSaveRecipe'));
    }
  };

  const calculateCost = async (productId) => {
    try {
      const response = await API.get(`/recipes/cost/${productId}`);
      alert(`
${t('product')}: ${response.data.data.product_name}
${t('sellingPrice')}: Br ${response.data.data.selling_price}
${t('ingredientCost')}: Br ${response.data.data.ingredient_cost}
${t('profit')}: Br ${response.data.data.profit}
${t('profitMargin')}: ${response.data.data.profit_margin}%
      `);
    } catch (err) {
      alert(t('noRecipeFoundForProduct'));
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const hasRecipe = (productId) => {
    return recipes.some(r => r.product_id === productId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white">{t('recipeManagement')}</h1>
        <p className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 mt-1">{t('defineProductRecipes')}</p>
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <UtensilsCrossed size={20} className="text-blue-600 dark:text-blue-400 mt-0.5" />
          <div>
            <p className="text-blue-700 dark:text-blue-400 font-semibold">{t('howRecipesWork')}</p>
            <p className="text-gray-600 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 text-sm mt-1">
              {t('recipeDescription')}
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-500 dark:text-gray-400 dark:text-gray-500" size={18} />
        <input
          type="text"
          placeholder={`${t('search')} ${t('products')}...`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-3 bg-white dark:bg-white dark:bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 pl-10"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X size={18} className="text-gray-500 dark:text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-600 dark:text-gray-600 dark:text-gray-300" />
          </button>
        )}
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProducts.map(product => {
          const hasRecipeFlag = hasRecipe(product.id);
          
          return (
            <div key={product.id} className="bg-white dark:bg-white dark:bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700 p-4 hover:border-gray-300 dark:hover:border-gray-300 dark:border-gray-600 transition-all shadow-sm hover:shadow-md">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white text-lg">{product.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400">{product.category || t('uncategorized')}</p>
                  <p className="text-blue-600 dark:text-blue-400 font-bold mt-1">Br {parseFloat(product.price).toFixed(2)}</p>
                </div>
                {hasRecipeFlag ? (
                  <CheckCircle size={20} className="text-green-600 dark:text-green-400" />
                ) : (
                  <AlertCircle size={20} className="text-yellow-600 dark:text-yellow-400" />
                )}
              </div>
              
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => viewRecipe(product.id)}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-gray-900 dark:text-gray-900 dark:text-white rounded-lg text-sm font-semibold transition"
                >
                  {hasRecipeFlag ? t('viewRecipe') : t('setupRecipe')}
                </button>
                <button
                  onClick={() => calculateCost(product.id)}
                  className="py-2 px-3 bg-gray-100 dark:bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300 rounded-lg transition"
                  title={t('calculateCost')}
                >
                  <DollarSign size={16} />
                </button>
              </div>
              
              {hasRecipeFlag && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-green-600 dark:text-green-400">✓ {t('recipeExists')}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredProducts.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-white dark:bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700">
          <UtensilsCrossed size={48} className="mx-auto text-gray-500 dark:text-gray-500 dark:text-gray-400 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400">{t('noProductsFound')}</p>
        </div>
      )}

      {/* Recipe Modal */}
      {showModal && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-white dark:bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700">
            <div className="sticky top-0 bg-white dark:bg-white dark:bg-white dark:bg-gray-800 p-6 border-b border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white">{t('recipe')}: {selectedProduct.product_name}</h2>
                  <p className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 text-sm mt-1">
                    {t('sellingPrice')}: Br {selectedProduct.selling_price}
                  </p>
                </div>
                <button onClick={() => setShowModal(false)} className="text-gray-500 dark:text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-600 dark:text-gray-600 dark:text-gray-300">
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Profit Summary */}
              {costData && (
                <div className="bg-gray-50 dark:bg-gray-100 dark:bg-gray-700 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white mb-3">{t('profitSummary')}</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 text-sm">{t('sellingPrice')}</p>
                      <p className="text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white font-bold">Br {costData.selling_price}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 text-sm">{t('ingredientCost')}</p>
                      <p className="text-red-600 dark:text-red-400 font-bold">Br {costData.total_ingredient_cost}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 text-sm">{t('profit')}</p>
                      <p className="text-green-600 dark:text-green-400 font-bold">Br {costData.profit}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-300 dark:border-gray-600">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 text-sm">{t('profitMargin')}</span>
                      <span className="text-green-600 dark:text-green-400 font-bold">{costData.profit_margin}%</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Ingredients List */}
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white mb-3">{t('ingredientsNeeded')}</h3>
                <div className="space-y-2">
                  {recipeIngredients.map((ing, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-gray-50 dark:bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
                      <div>
                        <p className="text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white font-medium">{ing.ingredient_name}</p>
                        <p className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 text-sm">
                          {ing.quantity_required} {ing.unit} × Br {ing.unit_cost} = Br {ing.cost_per_product}
                        </p>
                      </div>
                      <button
                        onClick={() => removeIngredientFromRecipe(idx)}
                        className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  
                  {recipeIngredients.length === 0 && (
                    <div className="text-center py-6 text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400">
                      {t('noIngredientsAddedYet')}
                    </div>
                  )}
                </div>
              </div>

              {/* Add Ingredient Form */}
              <div className="border-t border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700 pt-4">
                <h3 className="font-semibold text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white mb-3">{t('addIngredient')}</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <select
                    value={selectedIngredient.ingredient_id}
                    onChange={(e) => setSelectedIngredient({ ...selectedIngredient, ingredient_id: e.target.value })}
                    className="px-3 py-2 bg-gray-50 dark:bg-gray-50 dark:bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">{t('selectIngredient')}</option>
                    {ingredients.map(ing => (
                      <option key={ing.id} value={ing.id}>
                        {ing.name} ({ing.unit}) - {t('stock')}: {ing.quantity}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    placeholder={t('quantityRequired')}
                    value={selectedIngredient.quantity_required}
                    onChange={(e) => setSelectedIngredient({ ...selectedIngredient, quantity_required: e.target.value })}
                    className="px-3 py-2 bg-gray-50 dark:bg-gray-50 dark:bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={addIngredientToRecipe}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-gray-900 dark:text-gray-900 dark:text-white rounded-lg font-semibold transition flex items-center justify-center gap-2"
                >
                  <Plus size={16} />
                  {t('addIngredient')}
                </button>
              </div>

              {/* Save Button */}
              <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700">
                <button
                  onClick={saveRecipe}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-gray-900 dark:text-gray-900 dark:text-white rounded-xl font-bold transition"
                >
                  {t('saveRecipe')}
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-3 bg-gray-100 dark:bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300 rounded-xl font-semibold transition"
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Recipes;