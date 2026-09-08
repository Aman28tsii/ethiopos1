// server/src/routes/companies.js

import express from 'express';
import {
    onboardCompany,
    getCompanyInfo,
    listCompanies
} from '../controllers/companyController.js';
import { protect, allowOwner } from '../middleware/auth.js';
import { authorizeCompany, requireCompanyContext } from '../middleware/authorization.js';
import { onboardLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// ============================================================
// ONBOARDING — PUBLIC (NO AUTH REQUIRED)
// ============================================================
router.post('/onboard', 
    onboardLimiter,  // Rate limiting only — no authentication
    onboardCompany
);

// ============================================================
// PROTECTED ROUTES — AUTH REQUIRED
// ============================================================

router.use(protect);
router.use(requireCompanyContext);

// Get company info (with branches and owners)
router.get('/:id', authorizeCompany, getCompanyInfo);

// List all companies (admin/owner only)
router.get('/', allowOwner, listCompanies);

export default router;