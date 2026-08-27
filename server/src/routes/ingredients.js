import express from 'express';
import { protect, allowManager, allowOwner } from '../middleware/auth.js';
import { authorizeCompany, authorizeBranch, requireCompanyContext } from '../middleware/authorization.js';
import {
    getAllIngredients,
    getIngredientById,
    createIngredient,
    updateIngredient,
    deleteIngredient,
    getLowStock,
    getLowStockAlert,
    adjustStock,
    getIngredientCategories
} from '../controllers/ingredientController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);
router.use(requireCompanyContext);

// ============================================
// INGREDIENT CRUD (Branch-level)
// ============================================

// Get all ingredients for current branch
router.get('/', authorizeBranch, allowManager, getAllIngredients);

// Get low stock for current branch
router.get('/low-stock', authorizeBranch, allowManager, getLowStock);

// Get low stock alert for current branch
router.get('/low-stock-alert', authorizeBranch, allowManager, getLowStockAlert);

// Get ingredient categories for current company
router.get('/categories', authorizeCompany, allowManager, getIngredientCategories);

// Get ingredient by ID (validate branch ownership)
router.get('/:id', authorizeBranch, allowManager, getIngredientById);

// Owner only for write operations
// Create ingredient - branch_id from user context
router.post('/', authorizeBranch, allowOwner, createIngredient);

// Update ingredient - validate branch ownership
router.put('/:id', authorizeBranch, allowOwner, updateIngredient);

// Delete ingredient - validate branch ownership
router.delete('/:id', authorizeBranch, allowOwner, deleteIngredient);

// Adjust stock - validate branch ownership
router.put('/:id/adjust-stock', authorizeBranch, allowOwner, adjustStock);

export default router;