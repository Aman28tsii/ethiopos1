import express from "express";
import {
    getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
    getCategories,
    getPublicProductsByTable
} from "../controllers/productController.js";
import { validateProduct, validatePagination } from "../middleware/validation.js";
import { protect, allowManager, allowOwner } from "../middleware/auth.js";
import { authorizeCompany, requireCompanyContext } from "../middleware/authorization.js";

const router = express.Router();

// ============================================================
// PUBLIC QR ROUTE (NO AUTH)
//
// Must be registered BEFORE "/:id" so that "/public" is not
// interpreted as an ID. This endpoint is scoped strictly by
// the table's company_id — never falls back to a default tenant.
// ============================================================
router.get("/public", getPublicProductsByTable);

// ============================================================
// AUTHENTICATED ROUTES
//
// Everything below requires a valid JWT and a resolved company
// context. The former "public" versions of these routes have
// been removed because they silently fell back to company_id=1.
// ============================================================
router.use(protect);
router.use(requireCompanyContext);

// Read endpoints (company-scoped)
router.get("/", validatePagination, authorizeCompany, getAllProducts);
router.get("/categories", authorizeCompany, getCategories);
router.get("/admin", authorizeCompany, allowManager, getAllProducts);

// Write endpoints (owner-scoped)
router.post("/", authorizeCompany, allowOwner, validateProduct, createProduct);
router.put("/:id", authorizeCompany, allowOwner, validateProduct, updateProduct);
router.delete("/:id", authorizeCompany, allowOwner, deleteProduct);

// Read by ID — registered LAST so it does not shadow "/public",
// "/categories", or "/admin".
router.get("/:id", authorizeCompany, getProductById);

export default router;