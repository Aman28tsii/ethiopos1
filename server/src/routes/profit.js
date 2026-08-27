import express from "express";
import {
  getProfitReport,
  getTodayProfit,
  getMonthlyTrend
} from "../controllers/profitController.js";
import { protect, allowManager } from "../middleware/auth.js";
import { authorizeCompany, authorizeBranch, requireCompanyContext } from "../middleware/authorization.js";

const router = express.Router();

// All profit routes require authentication, company context, and manager+ role
router.use(protect);
router.use(requireCompanyContext);
router.use(authorizeCompany);
router.use(allowManager);

// Profit report - branch filtered for normal staff, owner sees selected branch
router.get("/report", authorizeBranch, getProfitReport);
router.get("/today", authorizeBranch, getTodayProfit);

// Monthly trend - company-wide for owners, branch for staff
router.get("/trend", authorizeBranch, getMonthlyTrend);

export default router;
