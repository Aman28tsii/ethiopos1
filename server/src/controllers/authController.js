// server/src/controllers/authController.js

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { AppError, catchAsync } from '../middleware/errorHandler.js';
import { ALLOWED_ROLES } from '../middleware/auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role, 
      name: user.name,
      company_id: user.company_id,
      branch_id: user.branch_id
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

// ============================================================
// LOGIN
// ============================================================
export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }
  
  const result = await query(
    `SELECT id, name, email, password, role, status, is_active, company_id, branch_id FROM users WHERE email = $1`,
    [email.toLowerCase().trim()]
  );
  
  const user = result.rows[0];
  
  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }
  
  if (user.status === 'pending') {
    return res.status(403).json({ success: false, error: 'Account pending approval. Please wait.' });
  }
  
  if (!user.is_active || user.status === 'inactive') {
    return res.status(403).json({ success: false, error: 'Account deactivated. Contact admin.' });
  }
  
  const isPasswordValid = await bcrypt.compare(password, user.password);
  
  if (!isPasswordValid) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }
  
  await query(`UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1`, [user.id]);
  
  const token = generateToken(user);
  
  res.json({
    success: true,
    message: 'Login successful',
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      company_id: user.company_id,
      branch_id: user.branch_id
    }
  });
});

// ============================================================
// SIGNUP
// ============================================================
export const signup = catchAsync(async (req, res) => {
  const { name, email, password, phone, role } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, error: 'Name, email and password are required' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
  }
  
  const userRole = role || 'staff';
  if (!ALLOWED_ROLES.includes(userRole) && userRole !== 'staff') {
    return res.status(400).json({ success: false, error: `Invalid role: ${userRole}. Allowed roles: ${ALLOWED_ROLES.join(', ')}` });
  }
  
  const existingUser = await query('SELECT id, status FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  
  if (existingUser.rows.length > 0) {
    if (existingUser.rows[0].status === 'pending') {
      return res.status(400).json({ success: false, error: 'Account already pending approval' });
    }
    return res.status(400).json({ success: false, error: 'Email already registered' });
  }
  
  const hashedPassword = await bcrypt.hash(password, 12);
  
  const result = await query(
    `INSERT INTO users (business_id, name, email, password, role, phone, status, is_active, company_id, branch_id)
     VALUES (1, $1, $2, $3, $4, $5, 'pending', false, (SELECT id FROM companies LIMIT 1), (SELECT id FROM branches LIMIT 1))
     RETURNING id, name, email, role, status, created_at, company_id, branch_id`,
    [name.trim(), email.toLowerCase().trim(), hashedPassword, userRole, phone || null]
  );
  
  res.status(201).json({
    success: true,
    message: 'Account created! Waiting for admin approval.',
    user: result.rows[0]
  });
});

// ============================================================
// GET PENDING USERS
// ============================================================
export const getPendingUsers = catchAsync(async (req, res) => {
  if (!req.user?.company_id) {
    throw new AppError('Authentication required', 401);
  }
  
  const companyId = req.user.company_id;
  
  const result = await query(
    `SELECT id, name, email, phone, status, created_at
     FROM users WHERE status = 'pending' AND company_id = $1
     ORDER BY created_at ASC`,
    [companyId]
  );
  
  res.json({ success: true, data: result.rows });
});

// ============================================================
// APPROVE USER
// ============================================================
export const approveUser = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { role = 'staff' } = req.body;
  
  if (!req.user?.company_id) {
    throw new AppError('Authentication required', 401);
  }
  
  const companyId = req.user.company_id;
  
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ success: false, error: `Invalid role: ${role}. Allowed roles: ${ALLOWED_ROLES.join(', ')}` });
  }
  
  const result = await query(
    `UPDATE users 
     SET status = 'active', role = $1, is_active = true
     WHERE id = $2 AND status = 'pending' AND company_id = $3
     RETURNING id, name, email, role, status, company_id, branch_id`,
    [role, id, companyId]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'User not found or already approved' });
  }
  
  res.json({
    success: true,
    message: 'User approved successfully',
    user: result.rows[0]
  });
});

// ============================================================
// REJECT USER
// ============================================================
export const rejectUser = catchAsync(async (req, res) => {
  const { id } = req.params;
  
  if (!req.user?.company_id) {
    throw new AppError('Authentication required', 401);
  }
  
  const companyId = req.user.company_id;
  
  const result = await query(
    `DELETE FROM users WHERE id = $1 AND status = 'pending' AND company_id = $2 RETURNING id`,
    [id, companyId]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }
  
  res.json({
    success: true,
    message: 'User rejected and removed'
  });
});

// ============================================================
// GET ALL USERS
// ============================================================
export const getAllUsers = catchAsync(async (req, res) => {
  if (!req.user?.company_id) {
    throw new AppError('Authentication required', 401);
  }
  
  const companyId = req.user.company_id;
  
  const result = await query(
    `SELECT id, name, email, role, phone, status, is_active, created_at, last_login, company_id, branch_id
     FROM users WHERE company_id = $1
     ORDER BY created_at DESC`,
    [companyId]
  );
  
  res.json({ success: true, data: result.rows });
});

// ============================================================
// GET CURRENT USER
// ============================================================
export const getCurrentUser = catchAsync(async (req, res) => {
  const result = await query(
    `SELECT id, name, email, role, phone, status, created_at, company_id, branch_id FROM users WHERE id = $1`,
    [req.user.id]
  );
  
  res.json({ success: true, user: result.rows[0] });
});

// ============================================================
// VERIFY TOKEN
// ============================================================
export const verifyToken = catchAsync(async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.json({ valid: false });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await query(
      'SELECT id, name, email, role, status, company_id, branch_id FROM users WHERE id = $1',
      [decoded.id]
    );
    
    if (user.rows.length === 0 || user.rows[0].status !== 'active') {
      return res.json({ valid: false });
    }
    
    res.json({ valid: true, user: user.rows[0] });
  } catch (error) {
    res.json({ valid: false });
  }
});

// ============================================================
// LOGOUT
// ============================================================
export const logout = catchAsync(async (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

// ============================================================
// UPDATE USER
// ============================================================
export const updateUser = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { name, email, role, phone, station_type } = req.body;
  
  if (!req.user?.company_id) {
    throw new AppError('Authentication required', 401);
  }
  
  const companyId = req.user.company_id;
  
  if (role && !ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ success: false, error: `Invalid role: ${role}. Allowed roles: ${ALLOWED_ROLES.join(', ')}` });
  }
  
  let queryStr = 'UPDATE users SET ';
  const params = [];
  let paramIndex = 1;
  
  if (name) {
    queryStr += `name = $${paramIndex++}, `;
    params.push(name.trim());
  }
  if (email) {
    queryStr += `email = $${paramIndex++}, `;
    params.push(email.toLowerCase().trim());
  }
  if (role) {
    queryStr += `role = $${paramIndex++}, `;
    params.push(role);
  }
  if (phone !== undefined) {
    queryStr += `phone = $${paramIndex++}, `;
    params.push(phone);
  }
  if (station_type) {
    queryStr += `station_type = $${paramIndex++}, `;
    params.push(station_type);
  }
  
  queryStr += `updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} AND company_id = $${paramIndex + 1} RETURNING *`;
  params.push(id, companyId);
  
  const result = await query(queryStr, params);
  
  if (result.rows.length === 0) {
    throw new AppError('User not found', 404);
  }
  
  res.json({
    success: true,
    message: 'User updated successfully',
    user: result.rows[0]
  });
});

// ============================================================
// DELETE USER
// ============================================================
export const deleteUser = catchAsync(async (req, res) => {
  const { id } = req.params;
  
  if (!req.user?.company_id) {
    throw new AppError('Authentication required', 401);
  }
  
  const companyId = req.user.company_id;
  
  const result = await query(
    'DELETE FROM users WHERE id = $1 AND company_id = $2 RETURNING id',
    [id, companyId]
  );
  
  if (result.rows.length === 0) {
    throw new AppError('User not found', 404);
  }
  
  res.json({
    success: true,
    message: 'User deleted successfully'
  });
});

// ============================================================
// GET STAFF PERFORMANCE
// ============================================================
export const getStaffPerformance = catchAsync(async (req, res) => {
    const { period = 'month' } = req.query;
    
    if (!req.user?.company_id) {
        throw new AppError('Authentication required', 401);
    }
    
    const companyId = req.user.company_id;
    const branchId = req.user.branch_id;
    
    let days;
    switch(period) {
        case 'week': days = 7; break;
        case 'month': days = 30; break;
        case 'year': days = 365; break;
        default: days = 30;
    }
    
    // Get sales by staff from orders (not sales table)
    const salesByStaff = await query(`
        SELECT 
            u.id,
            u.name,
            u.role,
            COUNT(o.id) as total_sales,
            COALESCE(SUM(o.total_amount), 0) as total_revenue,
            COALESCE(AVG(o.total_amount), 0) as avg_order_value
        FROM users u
        LEFT JOIN orders o ON u.id = o.created_by 
          AND o.created_at >= NOW() - INTERVAL '${days} days'
          AND o.status = 'completed'
          AND o.company_id = $1
          AND o.branch_id = $2
        WHERE u.role IN ('cashier', 'waiter', 'manager', 'owner', 'admin')
          AND u.company_id = $1
        GROUP BY u.id, u.name, u.role
        ORDER BY total_revenue DESC
    `, [companyId, branchId]);
    
    res.json({
        success: true,
        data: {
            sales_by_staff: salesByStaff.rows,
            period: period
        }
    });
});
// ============================================================
// SWITCH BRANCH (Owner/Admin only)
// ============================================================
export const switchBranch = catchAsync(async (req, res) => {
    const { branchId } = req.body;
    const userId = req.user.id;
    const companyId = req.user.company_id;
    
    if (!branchId) {
        return res.status(400).json({
            success: false,
            error: 'Branch ID required'
        });
    }
    
    // Verify branch belongs to user's company
    const branchCheck = await query(
        'SELECT id, name, is_active FROM branches WHERE id = $1 AND company_id = $2',
        [branchId, companyId]
    );
    
    if (branchCheck.rows.length === 0) {
        return res.status(403).json({
            success: false,
            error: 'Branch not accessible for this company'
        });
    }
    
    if (!branchCheck.rows[0].is_active) {
        return res.status(403).json({
            success: false,
            error: 'Branch is inactive'
        });
    }
    
    // Update user's branch in database
    await query(
        'UPDATE users SET branch_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [branchId, userId]
    );
    
    // Get updated user data
    const userResult = await query(
        `SELECT id, name, email, role, phone, status, is_active, company_id, branch_id 
         FROM users WHERE id = $1`,
        [userId]
    );
    
    const updatedUser = userResult.rows[0];
    
    // Generate new JWT with updated branch
    const newToken = generateToken(updatedUser);
    
    res.json({
        success: true,
        message: 'Branch switched successfully',
        token: newToken,
        user: {
            id: updatedUser.id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            company_id: updatedUser.company_id,
            branch_id: updatedUser.branch_id
        },
        branch: {
            id: branchCheck.rows[0].id,
            name: branchCheck.rows[0].name
        }
    });
});