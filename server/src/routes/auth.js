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
import { authorizeCompany, authorizeBranch, requireCompanyContext } from '../middleware/authorization.js';

const router = express.Router();

// Public routes
router.post('/login', login);
router.post('/signup', signup);
router.post('/verify', verifyToken);

// Protected routes
router.use(protect);

// All routes below require company context
router.use(requireCompanyContext);

router.get('/me', getCurrentUser);
router.post('/logout', logout);

// Owner only routes - with company isolation
router.get('/users', authorizeCompany, allowOwner, getAllUsers);
router.get('/users/pending', authorizeCompany, allowOwner, getPendingUsers);
router.put('/users/:id/approve', authorizeCompany, allowOwner, approveUser);
router.delete('/users/:id/reject', authorizeCompany, allowOwner, rejectUser);
router.put('/users/:id', authorizeCompany, allowOwner, updateUser);
router.delete('/users/:id', authorizeCompany, allowOwner, deleteUser);
router.get('/performance', authorizeCompany, allowOwner, getStaffPerformance);

export default router;