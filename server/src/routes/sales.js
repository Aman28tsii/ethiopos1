// server/src/routes/sales.js

import express from 'express';
import {
    createSale,
    getSales,
    getSaleById,
    getTodaySales
} from '../controllers/saleController.js';
import { protect, allowCashier, allowManager } from '../middleware/auth.js';
import { requireIdempotency, idempotent } from '../middleware/idempotency.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// ============================================
// CASHIER ROUTES
// ============================================

// ✅ FIX: Added idempotency protection to prevent duplicate sales
router.post('/', allowCashier, requireIdempotency, idempotent, createSale);

// Cashier and above can view sales
router.get('/', allowCashier, getSales);
router.get('/today', allowCashier, getTodaySales);
router.get('/:id', allowCashier, getSaleById);

export default router;