import express from "express";
import {
    getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    getCategories
} from "../controllers/productController.js";
import { validateProduct, validatePagination } from "../middleware/validation.js";
import { protect, allowManager, allowOwner } from "../middleware/auth.js";
import { authorizeCompany, requireCompanyContext } from "../middleware/authorization.js";

const router = express.Router();

// ============================================================
// PUBLIC ROUTES (No auth - but still company filtered)
// ============================================================
router.get("/", validatePagination, getAllProducts);
router.get("/categories", getCategories);
router.get("/:id", getProductById);

// ============================================================
// PROTECTED ROUTES
// ============================================================
router.use(protect);
router.use(requireCompanyContext);

router.get("/all", authorizeCompany, allowManager, getAllProducts);
router.post("/", authorizeCompany, allowOwner, validateProduct, createProduct);
router.put("/:id", authorizeCompany, allowOwner, validateProduct, updateProduct);
router.delete("/:id", authorizeCompany, allowOwner, deleteProduct);

export default router;
