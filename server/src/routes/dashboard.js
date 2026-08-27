import express from "express";
import {
  getDashboardData,
  getChartData
} from "../controllers/dashboardController.js";
import { protect, allowManager } from "../middleware/auth.js";
import { authorizeCompany, authorizeBranch, requireCompanyContext } from "../middleware/authorization.js";

const router = express.Router();

// All dashboard routes require authentication, company context, and manager+ role
router.use(protect);
router.use(requireCompanyContext);
router.use(authorizeCompany);
router.use(allowManager);

// Dashboard data - branch filtered for normal staff, owner sees selected branch
router.get("/", authorizeBranch, getDashboardData);

// Chart data - branch filtered
router.get("/charts", authorizeBranch, getChartData);

export default router;
