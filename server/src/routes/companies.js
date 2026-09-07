// server/src/routes/companies.js

import express from 'express';
import {
    onboardCompany,
    getCompanyInfo,
    listCompanies
} from '../controllers/companyController.js';
import { protect, allowOwner } from '../middleware/auth.js';
import { authorizeCompany, requireCompanyContext } from '../middleware/authorization.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiting for onboarding
const onboardLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 requests per hour
    message: {
        success: false,
        error: 'Too many company creation requests. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// ============================================================
// PUBLIC ROUTES
// ============================================================

// Onboard new company (requires admin/owner auth)
// POST /api/companies/onboard
router.post('/onboard', 
    protect,           // Must be authenticated
    allowOwner,        // Must be admin or owner
    onboardLimiter,    // Rate limit
    onboardCompany
);

// ============================================================
// PROTECTED ROUTES
// ============================================================

router.use(protect);
router.use(requireCompanyContext);

// Get company info (with branches and owners)
router.get('/:id', authorizeCompany, getCompanyInfo);

// List all companies (admin/owner only)
router.get('/', allowOwner, listCompanies);

export default router;