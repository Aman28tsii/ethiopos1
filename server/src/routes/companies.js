// server/src/routes/companies.js

import express from 'express';
import {
    onboardCompany,
    getCompanyInfo,
    listCompanies,
    updateCompanyBranding
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

// Update company branding — owner only, tenant-scoped.
// Reuses the same middleware as the routes above; no new middleware.
router.put('/:id/branding', authorizeCompany, allowOwner, updateCompanyBranding);

export default router;