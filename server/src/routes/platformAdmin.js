// server/src/routes/platformAdmin.js

import express from 'express';
import { protect, allowPlatformAdmin } from '../middleware/auth.js';
import { readLimiter, mutationLimiter } from '../middleware/rateLimiter.js';
import {
  getDashboard,
  listRegistrations,
  getRegistration,
  approveRegistration,
  rejectRegistration,
} from '../controllers/platformAdminController.js';

const router = express.Router();

// Every route requires authentication AND the platform_admin role.
router.use(protect);
router.use(allowPlatformAdmin);

// Read
router.get('/dashboard',           readLimiter,     getDashboard);
router.get('/registrations',       readLimiter,     listRegistrations);
router.get('/registrations/:id',   readLimiter,     getRegistration);

// Mutations
router.post('/registrations/:id/approve', mutationLimiter, approveRegistration);
router.post('/registrations/:id/reject',  mutationLimiter, rejectRegistration);

export default router;