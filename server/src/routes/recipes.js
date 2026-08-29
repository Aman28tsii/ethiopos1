import express from "express";
import {
    getAllRecipes,
    getRecipeByProduct,
    createOrUpdateRecipe,
    deleteRecipe,
    deleteRecipeIngredient,
    getWastageReport,
    getOrderWastage,
    updateIngredientWastage,
    getAllIngredientsWithWastage,
    getLowStockIngredients,
    getProductsWithoutRecipes,
    getRecipeCount,
    calculateOrderWastage
} from "../controllers/recipeController.js";
import { protect, allowManager, allowOwner } from "../middleware/auth.js";
import { authorizeCompany, authorizeBranch, requireCompanyContext } from "../middleware/authorization.js";

const router = express.Router();

// All routes require authentication and company context
router.use(protect);
router.use(requireCompanyContext);

// ============================================================
// RECIPE MANAGEMENT (Company-level)
// ============================================================
router.get("/", authorizeCompany, allowManager, getAllRecipes);
router.get("/product/:productId", authorizeCompany, allowManager, getRecipeByProduct);
router.post("/product/:productId", authorizeCompany, allowManager, createOrUpdateRecipe);
router.delete("/:id", authorizeCompany, allowOwner, deleteRecipe);
router.delete("/ingredient/:id", authorizeCompany, allowOwner, deleteRecipeIngredient);

// Products without recipes (Company-level)
router.get("/products-without", authorizeCompany, allowManager, getProductsWithoutRecipes);
router.get("/count", authorizeCompany, allowManager, getRecipeCount);

// ============================================================
// WASTAGE REPORTS (Branch-level)
// ============================================================
router.get("/wastage-report", authorizeBranch, allowManager, getWastageReport);
router.get("/order/:orderId/wastage", authorizeBranch, allowManager, getOrderWastage);
router.post("/order/:orderId/calculate-wastage", authorizeBranch, allowManager, calculateOrderWastage);

// ============================================================
// INGREDIENT WASTAGE SETTINGS (Branch-level)
// ============================================================
router.put("/ingredient/:id/wastage", authorizeBranch, allowOwner, updateIngredientWastage);
router.get("/ingredients", authorizeBranch, allowManager, getAllIngredientsWithWastage);
router.get("/ingredients/low-stock", authorizeBranch, allowManager, getLowStockIngredients);

export default router;