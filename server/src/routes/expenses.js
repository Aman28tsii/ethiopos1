import express from "express";
import {
  getAllExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseSummary,
  getExpenseCategories
} from "../controllers/expenseController.js";
import { protect, allowOwner } from "../middleware/auth.js";
import { authorizeCompany, authorizeBranch, requireCompanyContext } from "../middleware/authorization.js";

const router = express.Router();

// All expense routes require authentication, company context, and owner role
router.use(protect);
router.use(requireCompanyContext);
router.use(authorizeCompany);
router.use(allowOwner);

// Branch-level expense routes
router.get("/", authorizeBranch, getAllExpenses);
router.get("/summary", authorizeBranch, getExpenseSummary);
router.get("/categories", authorizeBranch, getExpenseCategories);
router.get("/:id", authorizeBranch, getExpenseById);
router.post("/", authorizeBranch, createExpense);
router.put("/:id", authorizeBranch, updateExpense);
router.delete("/:id", authorizeBranch, deleteExpense);

export default router;
