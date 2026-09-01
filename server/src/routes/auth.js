// server/src/routes/auth.js

import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  login,
  signup,
  getCurrentUser,
  getAllUsers,
  getPendingUsers,
  approveUser,
  rejectUser,
  verifyToken,
  getStaffPerformance,
  logout,
  updateUser,
  deleteUser,
  switchBranch
} from '../controllers/authController.js';
import { protect, allowOwner } from '../middleware/auth.js';
import { 
    authorizeCompany, 
    authorizeBranch, 
    requireCompanyContext,
    validateBranchAccess,
    getOwnerBranches
} from '../middleware/authorization.js';
import { pool } from '../config/database.js';

const router = express.Router();

// ============================================================
// RATE LIMITING FOR AUTH
// ============================================================

// ✅ ADDED: Rate limiting for login to prevent brute force
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 login attempts
    message: { 
        success: false, 
        error: 'Too many login attempts. Please try again later.' 
    },
    standardHeaders: true,
    legacyHeaders: false
});

// ============================================================
// PUBLIC ROUTES
// ============================================================
router.post('/login', authLimiter, login);
router.post('/signup', signup);
router.post('/verify', verifyToken);

// ============================================================
// PROTECTED ROUTES
// ============================================================
router.use(protect);

// Get current user with branch/company info
router.get('/me', getCurrentUser);

// ============================================================
// BRANCH ROUTES
// ============================================================

// Get available branches for owner
router.get('/branches', protect, getOwnerBranches, async (req, res) => {
    if (req.user.role === 'owner' || req.user.role === 'admin') {
        try {
            const result = await pool.query(
                `SELECT id, name, address, phone, is_active 
                 FROM branches 
                 WHERE company_id = $1 AND is_active = true 
                 ORDER BY name`,
                [req.user.company_id]
            );
            return res.json({ 
                success: true, 
                data: result.rows 
            });
        } catch (err) {
            console.error('Get branches error:', err);
            return res.status(500).json({ 
                success: false, 
                error: err.message 
            });
        }
    }
    // Normal staff get only their branch
    res.json({ 
        success: true, 
        data: [{
            id: req.user.branch_id,
            name: 'My Branch',
            is_active: true
        }] 
    });
});

// ============================================================
// SWITCH BRANCH
// ============================================================
router.post('/switch-branch', protect, allowOwner, switchBranch);

// ============================================================
// USER MANAGEMENT (Owner only)
// ============================================================
router.get('/users', authorizeCompany, allowOwner, getAllUsers);
router.get('/users/pending', authorizeCompany, allowOwner, getPendingUsers);
router.put('/users/:id/approve', authorizeCompany, allowOwner, approveUser);
router.delete('/users/:id/reject', authorizeCompany, allowOwner, rejectUser);
router.put('/users/:id', authorizeCompany, allowOwner, updateUser);
router.delete('/users/:id', authorizeCompany, allowOwner, deleteUser);
router.get('/performance', authorizeCompany, allowOwner, getStaffPerformance);

// ============================================================
// LOGOUT
// ============================================================
router.post('/logout', logout);

export default router;