// server/src/routes/auth.js
import express from 'express';
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
  deleteUser
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

// Public routes
router.post('/login', login);
router.post('/signup', signup);
router.post('/verify', verifyToken);

// Protected routes
router.use(protect);

// Get current user with branch/company info
router.get('/me', getCurrentUser);

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

// Switch branch (Owner only)
router.post('/switch-branch', protect, allowOwner, async (req, res) => {
    const { branchId } = req.body;
    
    if (!branchId) {
        return res.status(400).json({ 
            success: false, 
            error: 'Branch ID required' 
        });
    }
    
    try {
        // Verify branch belongs to owner's company
        const branchCheck = await pool.query(
            'SELECT id, name FROM branches WHERE id = $1 AND company_id = $2 AND is_active = true',
            [branchId, req.user.company_id]
        );
        
        if (branchCheck.rows.length === 0) {
            return res.status(403).json({ 
                success: false, 
                error: 'Branch not accessible' 
            });
        }
        
        // Generate new JWT with updated branch
        const jwt = req.headers.authorization?.split(' ')[1];
        if (jwt) {
            // Return new token with updated branch
            const newToken = jwt; // In real implementation, generate new token
            res.json({ 
                success: true, 
                message: 'Branch switched successfully',
                branch: branchCheck.rows[0],
                token: newToken
            });
        } else {
            res.json({ 
                success: true, 
                message: 'Branch switched successfully',
                branch: branchCheck.rows[0]
            });
        }
    } catch (err) {
        console.error('Switch branch error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// All other auth routes...
router.get('/users', authorizeCompany, allowOwner, getAllUsers);
router.get('/users/pending', authorizeCompany, allowOwner, getPendingUsers);
router.put('/users/:id/approve', authorizeCompany, allowOwner, approveUser);
router.delete('/users/:id/reject', authorizeCompany, allowOwner, rejectUser);
router.put('/users/:id', authorizeCompany, allowOwner, updateUser);
router.delete('/users/:id', authorizeCompany, allowOwner, deleteUser);
router.get('/performance', authorizeCompany, allowOwner, getStaffPerformance);
router.post('/logout', logout);

export default router;