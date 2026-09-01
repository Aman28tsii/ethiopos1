// server/src/middleware/auth.js
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key';

// ✅ FIXED: Role hierarchy with admin at same level as owner
const roleHierarchy = {
  'kitchen': 1,
  'waiter': 2,
  'cashier': 3,
  'manager': 4,
  'admin': 6,
  'owner': 6
};

// Allowed roles for validation
export const ALLOWED_ROLES = ['kitchen', 'waiter', 'cashier', 'manager', 'owner', 'admin'];

// Verify token and attach user to request
export const protect = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ success: false, error: 'Not authorized. No token provided.' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Fetch full user details including company_id and branch_id
    const result = await query(
      `SELECT id, name, email, role, status, is_active, company_id, branch_id 
       FROM users WHERE id = $1`,
      [decoded.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'User not found.' });
    }
    
    const user = result.rows[0];
    
    if (user.status !== 'active' || !user.is_active) {
      return res.status(401).json({ success: false, error: 'Account is not active.' });
    }
    
    // Attach user data to request
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      company_id: user.company_id,
      branch_id: user.branch_id
    };
    
    console.log('[AUTH] User authenticated:', {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      company_id: req.user.company_id,
      branch_id: req.user.branch_id
    });
    
    next();
  } catch (error) {
    console.error('Auth error:', error.message);
    return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }
};

// Check if user has required role or higher
export const hasRole = (requiredRole) => {
  return (req, res, next) => {
    const userRole = req.user?.role;
    const userLevel = roleHierarchy[userRole] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;
    
    if (userLevel >= requiredLevel) {
      return next();
    }
    
    return res.status(403).json({ 
      success: false, 
      error: `Access denied. ${requiredRole} role or higher required.` 
    });
  };
};

// Role-specific middleware
export const allowOwner = hasRole('owner');
export const allowManager = hasRole('manager');
export const allowCashier = hasRole('cashier');
export const allowWaiter = hasRole('waiter');
export const allowKitchen = hasRole('kitchen');

// Check exact role (not hierarchy)
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (roles.includes(req.user.role)) {
      return next();
    }
    return res.status(403).json({ 
      success: false, 
      error: 'Access denied. You do not have permission for this action.' 
    });
  };
};

// Get user role info
export const getUserRole = (req) => {
  return req.user?.role || null;
};

// Check if user is owner or admin
export const isOwner = (req) => {
  const role = req.user?.role;
  return role === 'owner' || role === 'admin';
};

// Check if user is manager or above
export const isManagerOrAbove = (req) => {
  const role = req.user?.role;
  return role === 'owner' || role === 'admin' || role === 'manager';
};

// Get company_id from user
export const getCompanyId = (req) => {
  return req.user?.company_id || null;
};

// Get branch_id from user
export const getBranchId = (req) => {
  return req.user?.branch_id || null;
};