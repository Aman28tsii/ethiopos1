// client/src/components/RecipeManager.js

import React, { useState, useEffect } from 'react';
import API from '../api/axios';
import { 
    UtensilsCrossed, Plus, Trash2, X, Loader2, Save,
    DollarSign, AlertCircle, CheckCircle, Info, RefreshCw
} from 'lucide-react';

// ============================================
// UNIT OPTIONS - Multiple units supported
// ============================================
const UNIT_OPTIONS = [
    { value: 'kg', label: 'Kilogram (kg)' },
    { value: 'g', label: 'Gram (g)' },
    { value: 'L', label: 'Liter (L)' },
    { value: 'ml', label: 'Milliliter (ml)' },
    { value: 'pcs', label: 'Pieces (pcs)' },
    { value: 'cup', label: 'Cup' },
    { value: 'tbsp', label: 'Tablespoon (tbsp)' },
    { value: 'tsp', label: 'Teaspoon (tsp)' },
    { value: 'oz', label: 'Ounce (oz)' },
    { value: 'lb', label: 'Pound (lb)' },
];

// ============================================
// WASTAGE PRESETS - Common percentages
// ============================================
const WASTAGE_PRESETS = [0, 2, 5, 8, 10, 12, 15, 20];
const COOKING_LOSS_PRESETS = [0, 2, 3, 5, 8, 10, 15];

// ============================================
// RECIPE MANAGER COMPONENT
// ============================================
const RecipeManager = ({ productId, productName, productPrice, onSave, onClose }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [ingredients, setIngredients] = useState([]);
    const [allIngredients, setAllIngredients] = useState([]);
    const [costSummary, setCostSummary] = useState({
        totalCost: 0,
        totalWithWastage: 0,
        profit: 0,
        profitMargin: 0
    });
    const [yieldQuantity, setYieldQuantity] = useState(1);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    const [isNewProduct, setIsNewProduct] = useState(false);

    // ============================================
    // NEW INGREDIENT FORM STATE (with unit support)
    // ============================================
    const [selectedIngredient, setSelectedIngredient] = useState({
        ingredient_id: '',
        quantity_required: '',
        unit: 'kg',
        wastage_percentage: 5,
        cooking_loss_percentage: 3
    });

    // ============================================
    // FETCH DATA
    // ============================================
    useEffect(() => {
        fetchData();
    }, [productId]);

    useEffect(() => {
        setIsNewProduct(ingredients.length === 0);
    }, [ingredients]);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [recipeRes, ingredientsRes] = await Promise.all([
                API.get(`/recipes/product/${productId}`),
                API.get('/ingredients')
            ]);

            const recipeData = recipeRes.data.data;
            setIngredients(recipeData.ingredients || []);
            setYieldQuantity(recipeData.yield_quantity || 1);
            setAllIngredients(ingredientsRes.data.data || []);
            
            calculateCost(recipeData.ingredients || []);
        } catch (err) {
            console.error('Fetch recipe error:', err);
            try {
                const ingredientsRes = await API.get('/ingredients');
                setAllIngredients(ingredientsRes.data.data || []);
                setIngredients([]);
                calculateCost([]);
            } catch (e) {
                setError('Failed to load ingredients. Please refresh.');
            }
        } finally {
            setLoading(false);
        }
    };

    // ============================================
    // CALCULATE COST
    // ============================================
    const calculateCost = (ingList) => {
        let totalCost = 0;
        let totalWithWastage = 0;

        ingList.forEach(ing => {
            const qty = parseFloat(ing.quantity_required) || 0;
            const cost = parseFloat(ing.unit_cost) || 0;
            const wastage = parseFloat(ing.wastage_percentage) || 0;
            const cookingLoss = parseFloat(ing.cooking_loss_percentage) || 0;

            totalCost += qty * cost;
            const effectiveQty = qty * (1 + wastage / 100) * (1 + cookingLoss / 100);
            totalWithWastage += effectiveQty * cost;
        });

        const sellingPrice = parseFloat(productPrice) || 0;
        const profit = sellingPrice - totalWithWastage;
        const profitMargin = sellingPrice > 0 ? (profit / sellingPrice * 100) : 0;

        setCostSummary({
            totalCost: parseFloat(totalCost.toFixed(2)),
            totalWithWastage: parseFloat(totalWithWastage.toFixed(2)),
            profit: parseFloat(profit.toFixed(2)),
            profitMargin: parseFloat(profitMargin.toFixed(1))
        });
    };

    // ============================================
    // ADD INGREDIENT - ✅ FIXED: Include unit
    // ============================================
    const addIngredient = () => {
        if (!selectedIngredient.ingredient_id || !selectedIngredient.quantity_required) {
            setError('Please select an ingredient and enter quantity');
            return;
        }

        const ingredient = allIngredients.find(i => i.id === parseInt(selectedIngredient.ingredient_id));
        if (!ingredient) {
            setError('Selected ingredient not found');
            return;
        }

        if (ingredients.some(ing => ing.ingredient_id === ingredient.id)) {
            setError('This ingredient is already in the recipe');
            return;
        }

        const qty = parseFloat(selectedIngredient.quantity_required);
        const unitCost = parseFloat(ingredient.unit_cost);
        const wastage = parseFloat(selectedIngredient.wastage_percentage) || 0;
        const cookingLoss = parseFloat(selectedIngredient.cooking_loss_percentage) || 0;
        const unit = selectedIngredient.unit || ingredient.unit;

        const effectiveQty = qty * (1 + wastage / 100) * (1 + cookingLoss / 100);
        const costPerProduct = effectiveQty * unitCost;

        const newIngredient = {
            id: Date.now(),
            ingredient_id: ingredient.id,
            ingredient_name: ingredient.name,
            quantity_required: qty,
            unit: unit,
            unit_cost: unitCost,
            wastage_percentage: wastage,
            cooking_loss_percentage: cookingLoss,
            cost_per_product: parseFloat(costPerProduct.toFixed(2))
        };

        const updatedIngredients = [...ingredients, newIngredient];
        setIngredients(updatedIngredients);
        calculateCost(updatedIngredients);
        setError(null);

        setSelectedIngredient({
            ingredient_id: '',
            quantity_required: '',
            unit: 'kg',
            wastage_percentage: 5,
            cooking_loss_percentage: 3
        });
    };

    // ============================================
    // REMOVE INGREDIENT
    // ============================================
    const removeIngredient = (index) => {
        const updatedIngredients = ingredients.filter((_, i) => i !== index);
        setIngredients(updatedIngredients);
        calculateCost(updatedIngredients);
    };

    // ============================================
    // UPDATE INGREDIENT
    // ============================================
    const updateIngredientField = (index, field, value) => {
        const updated = ingredients.map((ing, i) => {
            if (i === index) {
                let val = value;
                if (field === 'wastage_percentage' || field === 'cooking_loss_percentage') {
                    val = parseFloat(value) || 0;
                } else if (field === 'quantity_required') {
                    val = parseFloat(value) || 0;
                }

                const qty = field === 'quantity_required' ? val : parseFloat(ing.quantity_required);
                const unitCost = parseFloat(ing.unit_cost);
                const wastage = field === 'wastage_percentage' ? val : parseFloat(ing.wastage_percentage) || 0;
                const cookingLoss = field === 'cooking_loss_percentage' ? val : parseFloat(ing.cooking_loss_percentage) || 0;

                const effectiveQty = qty * (1 + wastage / 100) * (1 + cookingLoss / 100);
                const cost = effectiveQty * unitCost;

                return {
                    ...ing,
                    [field]: val,
                    quantity_required: qty,
                    wastage_percentage: wastage,
                    cooking_loss_percentage: cookingLoss,
                    cost_per_product: parseFloat(cost.toFixed(2))
                };
            }
            return ing;
        });
        setIngredients(updated);
        calculateCost(updated);
    };

    // ============================================
    // SAVE RECIPE - ✅ FIXED: Include unit in payload
    // ============================================
    const saveRecipe = async () => {
        if (ingredients.length === 0) {
            setError('Please add at least one ingredient');
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const payload = {
                yield_quantity: yieldQuantity,
                ingredients: ingredients.map(ing => ({
                    ingredient_id: ing.ingredient_id,
                    unit: ing.unit,  // ✅ FIXED: Include unit
                    quantity_required: ing.quantity_required,
                    wastage_percentage: ing.wastage_percentage || 0,
                    cooking_loss_percentage: ing.cooking_loss_percentage || 0
                }))
            };

            await API.post(`/recipes/product/${productId}`, payload);
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
            if (onSave) onSave();
        } catch (err) {
            console.error('Save recipe error:', err);
            setError(err.response?.data?.error || 'Failed to save recipe');
        } finally {
            setSaving(false);
        }
    };

    // ============================================
    // LOADING
    // ============================================
    if (loading) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-8">
                    <Loader2 className="animate-spin text-blue-500 mx-auto" size={40} />
                    <p className="text-gray-500 mt-4">Loading recipe...</p>
                </div>
            </div>
        );
    }

    // ============================================
    // RENDER
    // ============================================
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700">

                {/* ============================================ */}
                {/* HEADER */}
                {/* ============================================ */}
                <div className="sticky top-0 bg-white dark:bg-gray-800 p-6 border-b border-gray-200 dark:border-gray-700 z-10">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <UtensilsCrossed size={24} className="text-purple-600 dark:text-purple-400" />
                                {isNewProduct ? 'Add Recipe for' : 'Recipe:'} {productName}
                            </h2>
                            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                                Selling Price: Br {parseFloat(productPrice).toFixed(2)}
                                {isNewProduct && (
                                    <span className="ml-2 text-green-600 dark:text-green-400 font-semibold">
                                        ⭐ New Product!
                                    </span>
                                )}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-6">

                    {/* ============================================ */}
                    {/* ERROR / SUCCESS */}
                    {/* ============================================ */}
                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-center gap-2 text-red-600 dark:text-red-400">
                            <AlertCircle size={18} />
                            <span>{error}</span>
                            <button onClick={() => setError(null)} className="ml-auto">
                                <X size={16} />
                            </button>
                        </div>
                    )}
                    {success && (
                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3 flex items-center gap-2 text-green-600 dark:text-green-400">
                            <CheckCircle size={18} />
                            <span>Recipe saved successfully!</span>
                        </div>
                    )}

                    {/* ============================================ */}
                    {/* WELCOME MESSAGE FOR NEW PRODUCT */}
                    {/* ============================================ */}
                    {isNewProduct && (
                        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
                            <div className="flex items-start gap-3">
                                <Info size={20} className="text-purple-600 dark:text-purple-400 mt-0.5" />
                                <div>
                                    <p className="text-purple-700 dark:text-purple-400 font-semibold">
                                        🎉 Product Created! Now Add Your Recipe
                                    </p>
                                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                                        Add ingredients, set wastage %, and cooking loss % to complete your product setup.
                                        This will enable automatic stock deduction when orders are placed.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ============================================ */}
                    {/* PROFIT SUMMARY */}
                    {/* ============================================ */}
                    <div className={`rounded-xl p-4 border ${
                        ingredients.length === 0 
                            ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                            : 'bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border-purple-200 dark:border-purple-800'
                    }`}>
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                            <DollarSign size={18} className="text-purple-600 dark:text-purple-400" />
                            Profit Summary
                            {ingredients.length === 0 && (
                                <span className="text-xs text-yellow-600 dark:text-yellow-400 font-normal">
                                    ⚠️ Add ingredients to see accurate profit
                                </span>
                            )}
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <p className="text-gray-500 dark:text-gray-400 text-sm">Base Cost</p>
                                <p className="text-gray-900 dark:text-white font-bold">Br {costSummary.totalCost.toFixed(2)}</p>
                            </div>
                            <div>
                                <p className="text-gray-500 dark:text-gray-400 text-sm flex items-center gap-1">
                                    Cost + Wastage
                                    <Info size={12} className="text-gray-400" />
                                </p>
                                <p className="text-orange-600 dark:text-orange-400 font-bold">
                                    Br {costSummary.totalWithWastage.toFixed(2)}
                                </p>
                            </div>
                            <div>
                                <p className="text-gray-500 dark:text-gray-400 text-sm">Profit</p>
                                <p className={`font-bold ${
                                    costSummary.profit >= 0 
                                        ? 'text-green-600 dark:text-green-400' 
                                        : 'text-red-600 dark:text-red-400'
                                }`}>
                                    Br {costSummary.profit.toFixed(2)}
                                </p>
                            </div>
                            <div>
                                <p className="text-gray-500 dark:text-gray-400 text-sm">Profit Margin</p>
                                <p className={`font-bold ${
                                    costSummary.profitMargin >= 30 
                                        ? 'text-green-600 dark:text-green-400' 
                                        : costSummary.profitMargin >= 15 
                                            ? 'text-yellow-600 dark:text-yellow-400' 
                                            : 'text-red-600 dark:text-red-400'
                                }`}>
                                    {costSummary.profitMargin.toFixed(1)}%
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* ============================================ */}
                    {/* YIELD QUANTITY */}
                    {/* ============================================ */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Yield Quantity
                            <span className="text-gray-500 text-xs ml-2">(How many portions this recipe makes)</span>
                        </label>
                        <input
                            type="number"
                            min="0.5"
                            step="0.5"
                            value={yieldQuantity}
                            onChange={(e) => setYieldQuantity(parseFloat(e.target.value) || 1)}
                            className="w-32 px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                    </div>

                    {/* ============================================ */}
                    {/* INGREDIENTS LIST */}
                    {/* ============================================ */}
                    <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center justify-between">
                            <span>Ingredients Needed</span>
                            <span className="text-sm font-normal text-gray-500">
                                {ingredients.length} ingredient{ingredients.length !== 1 ? 's' : ''}
                            </span>
                        </h3>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {ingredients.map((ing, idx) => (
                                <div key={idx} className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <p className="text-gray-900 dark:text-white font-medium">{ing.ingredient_name}</p>
                                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={ing.quantity_required}
                                                    onChange={(e) => updateIngredientField(idx, 'quantity_required', e.target.value)}
                                                    className="w-20 px-2 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-sm"
                                                />
                                                <span className="text-gray-500 dark:text-gray-400">{ing.unit}</span>
                                                <span className="text-gray-500 dark:text-gray-400">×</span>
                                                <span className="text-gray-500 dark:text-gray-400">Br {parseFloat(ing.unit_cost).toFixed(2)}</span>
                                                <span className="text-gray-500 dark:text-gray-400">=</span>
                                                <span className="text-purple-600 dark:text-purple-400 font-medium">
                                                    Br {ing.cost_per_product.toFixed(2)}
                                                </span>
                                                <span className="text-xs text-gray-400">
                                                    (Stock: {allIngredients.find(i => i.id === ing.ingredient_id)?.quantity || 0})
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                <label className="text-xs text-gray-500 dark:text-gray-400">Wastage:</label>
                                                <input
                                                    type="number"
                                                    step="0.5"
                                                    min="0"
                                                    max="50"
                                                    value={ing.wastage_percentage || 0}
                                                    onChange={(e) => updateIngredientField(idx, 'wastage_percentage', e.target.value)}
                                                    className="w-16 px-1 py-0.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-xs"
                                                />
                                                <span className="text-xs text-gray-500 dark:text-gray-400">%</span>
                                                <label className="text-xs text-gray-500 dark:text-gray-400 ml-2">Cooking Loss:</label>
                                                <input
                                                    type="number"
                                                    step="0.5"
                                                    min="0"
                                                    max="50"
                                                    value={ing.cooking_loss_percentage || 0}
                                                    onChange={(e) => updateIngredientField(idx, 'cooking_loss_percentage', e.target.value)}
                                                    className="w-16 px-1 py-0.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-xs"
                                                />
                                                <span className="text-xs text-gray-500 dark:text-gray-400">%</span>
                                                <span className="text-xs text-gray-400 ml-auto">
                                                    Effective: {parseFloat(ing.quantity_required * (1 + (ing.wastage_percentage || 0) / 100) * (1 + (ing.cooking_loss_percentage || 0) / 100)).toFixed(3)} {ing.unit}
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => removeIngredient(idx)}
                                            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 p-1 transition"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {ingredients.length === 0 && (
                                <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                                    <UtensilsCrossed size={32} className="mx-auto mb-2 opacity-50" />
                                    No ingredients added yet
                                    {isNewProduct && (
                                        <p className="text-sm text-purple-600 dark:text-purple-400 mt-2">
                                            Add ingredients below to complete your product setup!
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ============================================ */}
                    {/* ADD INGREDIENT FORM - ✅ FIXED: Unit included */}
                    {/* ============================================ */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Add Ingredient</h3>

                        {/* Ingredient Select */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                            <select
                                value={selectedIngredient.ingredient_id}
                                onChange={(e) => setSelectedIngredient({ ...selectedIngredient, ingredient_id: e.target.value })}
                                className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                            >
                                <option value="">Select Ingredient</option>
                                {allIngredients
                                    .filter(i => !ingredients.some(ing => ing.ingredient_id === i.id))
                                    .map(ing => (
                                        <option key={ing.id} value={ing.id}>
                                            {ing.name} ({ing.unit}) - Stock: {ing.quantity}
                                        </option>
                                    ))}
                            </select>

                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Quantity"
                                    value={selectedIngredient.quantity_required}
                                    onChange={(e) => setSelectedIngredient({ ...selectedIngredient, quantity_required: e.target.value })}
                                    className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                                <select
                                    value={selectedIngredient.unit}
                                    onChange={(e) => setSelectedIngredient({ ...selectedIngredient, unit: e.target.value })}
                                    className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                >
                                    {UNIT_OPTIONS.map(u => (
                                        <option key={u.value} value={u.value}>{u.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Wastage and Cooking Loss - With Presets */}
                        <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                                <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                    Wastage %
                                    <Info size={12} className="text-gray-400" />
                                </label>
                                <div className="flex gap-1 mt-1 flex-wrap">
                                    {WASTAGE_PRESETS.map(p => (
                                        <button
                                            key={p}
                                            type="button"
                                            onClick={() => setSelectedIngredient({ ...selectedIngredient, wastage_percentage: p })}
                                            className={`px-2 py-1 rounded text-xs ${
                                                selectedIngredient.wastage_percentage === p
                                                    ? 'bg-purple-600 text-white'
                                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                                            }`}
                                        >
                                            {p}%
                                        </button>
                                    ))}
                                </div>
                                <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    max="50"
                                    value={selectedIngredient.wastage_percentage}
                                    onChange={(e) => setSelectedIngredient({ ...selectedIngredient, wastage_percentage: parseFloat(e.target.value) || 0 })}
                                    className="w-full mt-1 px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                                <p className="text-xs text-gray-400 mt-1">Trimming, spoilage, spillage</p>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                    Cooking Loss %
                                    <Info size={12} className="text-gray-400" />
                                </label>
                                <div className="flex gap-1 mt-1 flex-wrap">
                                    {COOKING_LOSS_PRESETS.map(p => (
                                        <button
                                            key={p}
                                            type="button"
                                            onClick={() => setSelectedIngredient({ ...selectedIngredient, cooking_loss_percentage: p })}
                                            className={`px-2 py-1 rounded text-xs ${
                                                selectedIngredient.cooking_loss_percentage === p
                                                    ? 'bg-purple-600 text-white'
                                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                                            }`}
                                        >
                                            {p}%
                                        </button>
                                    ))}
                                </div>
                                <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    max="50"
                                    value={selectedIngredient.cooking_loss_percentage}
                                    onChange={(e) => setSelectedIngredient({ ...selectedIngredient, cooking_loss_percentage: parseFloat(e.target.value) || 0 })}
                                    className="w-full mt-1 px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                                <p className="text-xs text-gray-400 mt-1">Evaporation, shrinkage</p>
                            </div>
                        </div>

                        <button
                            onClick={addIngredient}
                            disabled={!selectedIngredient.ingredient_id || !selectedIngredient.quantity_required}
                            className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Plus size={16} />
                            Add Ingredient
                        </button>
                    </div>

                    {/* ============================================ */}
                    {/* SAVE BUTTONS */}
                    {/* ============================================ */}
                    <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <button
                            onClick={saveRecipe}
                            disabled={saving || ingredients.length === 0}
                            className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                            {saving ? 'Saving...' : isNewProduct ? 'Complete Product Setup' : 'Save Recipe'}
                        </button>
                        <button
                            onClick={onClose}
                            className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-semibold transition"
                        >
                            {ingredients.length === 0 ? 'Skip for Now' : 'Cancel'}
                        </button>
                    </div>

                    {/* ============================================ */}
                    {/* FOOTER NOTE */}
                    {/* ============================================ */}
                    {isNewProduct && ingredients.length > 0 && (
                        <p className="text-xs text-green-600 dark:text-green-400 text-center">
                            ✅ Product will be complete and ready to sell after saving!
                        </p>
                    )}
                    {isNewProduct && ingredients.length === 0 && (
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 text-center">
                            ⚠️ Product will be created but WILL NOT deduct stock until you add a recipe.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RecipeManager;