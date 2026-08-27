import express from 'express';
import {
    getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    getCategories
} from '../controllers/productController.js';
import { validateProduct, validatePagination } from '../middleware/validation.js';
import { protect, allowManager, allowOwner } from '../middleware/auth.js';
import { authorizeCompany, authorizeBranch, requireCompanyContext } from '../middleware/authorization.js';

const router = express.Router();

// ============================================
// PUBLIC ROUTES (No auth required)
// ============================================
// Still need company context for multi-tenant
// Uses query param for company selection (default: 1)
router.get('/', validatePagination, getAllProducts);
router.get('/categories', getCategories);
router.get('/:id', getProductById);

// ============================================
// PROTECTED ROUTES (Company-level products)
// ============================================
router.use(protect);
router.use(requireCompanyContext);

// Manager+ can view all products in their company
router.get('/all', authorizeCompany, allowManager, getAllProducts);
router.get('/company/:companyId', authorizeCompany, allowManager, getAllProducts);

// Owner-only write operations (company-level)
router.post('/', authorizeCompany, allowOwner, validateProduct, createProduct);
router.put('/:id', authorizeCompany, allowOwner, validateProduct, updateProduct);
router.delete('/:id', authorizeCompany, allowOwner, deleteProduct);

export default router;