// server/src/controllers/companyController.js

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, getClient } from '../config/database.js';
import { AppError, catchAsync } from '../middleware/errorHandler.js';
import { ALLOWED_ROLES } from '../middleware/auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// ============================================================
// ONBOARD COMPANY (Company → Branch → Owner)
// ============================================================
export const onboardCompany = catchAsync(async (req, res) => {
    const { company, branch, owner } = req.body;
    
    // ============================================
    // STEP 1: VALIDATION (Before BEGIN)
    // ============================================
    
    // Validate company
    if (!company?.name || company.name.trim().length < 2) {
        throw new AppError('Company name must be at least 2 characters', 400);
    }
    const companyName = company.name.trim();
    
    // Validate branch
    if (!branch?.name || branch.name.trim().length < 1) {
        throw new AppError('Branch name is required', 400);
    }
    const branchName = branch.name.trim();
    const branchAddress = branch.address?.trim() || null;
    const branchPhone = branch.phone?.trim() || null;
    
    // Validate owner
    if (!owner?.name || owner.name.trim().length < 2) {
        throw new AppError('Owner name must be at least 2 characters', 400);
    }
    if (!owner?.email) {
        throw new AppError('Owner email is required', 400);
    }
    if (!isValidEmail(owner.email)) {
        throw new AppError('Invalid email address', 400);
    }
    if (!owner?.password || owner.password.length < 6) {
        throw new AppError('Password must be at least 6 characters', 400);
    }
    
    const ownerName = owner.name.trim();
    const ownerEmail = owner.email.toLowerCase().trim();
    const ownerPhone = owner.phone?.trim() || null;
    
    // ============================================
    // STEP 2: UNIQUENESS CHECKS (Before BEGIN)
    // ============================================
    
    // Check email uniqueness
    const existingEmail = await query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
        [ownerEmail]
    );
    if (existingEmail.rows.length > 0) {
        throw new AppError('Email already registered', 409);
    }
    
    // Check company name uniqueness
    const existingCompany = await query(
        'SELECT id FROM companies WHERE LOWER(name) = LOWER($1)',
        [companyName]
    );
    if (existingCompany.rows.length > 0) {
        throw new AppError('Company name already exists', 409);
    }
    
    // ============================================
    // STEP 3: BEGIN TRANSACTION
    // ============================================
    
    const client = await getClient();
    
    try {
        await client.query('BEGIN');
        
        // ============================================
        // STEP 4: CREATE COMPANY
        // ============================================
        
        const companyResult = await client.query(
            `INSERT INTO companies (name, created_at, updated_at)
             VALUES ($1, NOW(), NOW())
             RETURNING id, name, created_at`,
            [companyName]
        );
        const companyId = companyResult.rows[0].id;
        
        // ============================================
        // STEP 5: CREATE BRANCH
        // ============================================
        
        const branchResult = await client.query(
            `INSERT INTO branches (company_id, name, address, phone, is_active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, true, NOW(), NOW())
             RETURNING id, name, address, phone, company_id`,
            [companyId, branchName, branchAddress, branchPhone]
        );
        const branchId = branchResult.rows[0].id;
        
        // ============================================
        // STEP 6: HASH OWNER PASSWORD
        // ============================================
        
        const hashedPassword = await bcrypt.hash(owner.password, 12);
        
        // ============================================
        // STEP 7: CREATE OWNER
        // ============================================
        
        // Use business_id = 1 for compatibility (legacy field)
        const userResult = await client.query(
            `INSERT INTO users (
                business_id, company_id, branch_id, name, email, password,
                role, phone, status, is_active, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', true, NOW(), NOW())
            RETURNING id, name, email, role, status, company_id, branch_id, created_at`,
            [1, companyId, branchId, ownerName, ownerEmail, hashedPassword, 'owner', ownerPhone]
        );
        const userId = userResult.rows[0].id;
        
        // ============================================
        // STEP 8: RELATIONSHIP VERIFICATION
        // ============================================
        
        const verifyResult = await client.query(
            `SELECT 
                c.id as company_id, c.name as company_name,
                b.id as branch_id, b.name as branch_name,
                u.id as user_id, u.name as user_name, u.email, u.role
             FROM companies c
             JOIN branches b ON b.company_id = c.id
             JOIN users u ON u.company_id = c.id AND u.branch_id = b.id
             WHERE c.id = $1 AND b.id = $2 AND u.id = $3
             AND u.role = 'owner' AND u.status = 'active' AND u.is_active = true`,
            [companyId, branchId, userId]
        );
        
        if (verifyResult.rows.length === 0) {
            throw new Error('Relationship verification failed - owner not correctly linked');
        }
        
        // ============================================
        // STEP 9: COMMIT
        // ============================================
        
        await client.query('COMMIT');
        
        // ============================================
        // STEP 10: GENERATE JWT (After COMMIT)
        // ============================================
        
        const user = userResult.rows[0];
        const token = jwt.sign(
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
        
        // ============================================
        // STEP 11: SUCCESS RESPONSE
        // ============================================
        
        res.status(201).json({
            success: true,
            message: 'Company onboarded successfully',
            data: {
                company: {
                    id: companyId,
                    name: companyResult.rows[0].name
                },
                branch: {
                    id: branchId,
                    name: branchResult.rows[0].name,
                    address: branchResult.rows[0].address,
                    phone: branchResult.rows[0].phone
                },
                owner: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    status: user.status,
                    company_id: user.company_id,
                    branch_id: user.branch_id
                },
                token: token
            }
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[ONBOARD] Transaction failed:', error);
        throw error;
    } finally {
        client.release();
    }
});

// ============================================================
// GET COMPANY BY ID (With branch and owner info)
// ============================================================
export const getCompanyInfo = catchAsync(async (req, res) => {
    const { id } = req.params;
    const companyId = parseInt(id);
    
    if (!companyId || isNaN(companyId)) {
        throw new AppError('Invalid company ID', 400);
    }
    
    // Verify company exists
    const companyResult = await query(
        'SELECT id, name, created_at, updated_at FROM companies WHERE id = $1',
        [companyId]
    );
    
    if (companyResult.rows.length === 0) {
        throw new AppError('Company not found', 404);
    }
    
    // Get branches
    const branchesResult = await query(
        `SELECT id, name, address, phone, is_active, created_at
         FROM branches WHERE company_id = $1
         ORDER BY name`,
        [companyId]
    );
    
    // Get owner users
    const ownersResult = await query(
        `SELECT id, name, email, phone, status, created_at
         FROM users WHERE company_id = $1 AND role = 'owner'
         ORDER BY created_at ASC`,
        [companyId]
    );
    
    res.json({
        success: true,
        data: {
            company: companyResult.rows[0],
            branches: branchesResult.rows,
            owners: ownersResult.rows
        }
    });
});

// ============================================================
// LIST ALL COMPANIES (Admin/Owner only)
// ============================================================
export const listCompanies = catchAsync(async (req, res) => {
    // Only admins/owners can list all companies
    if (!['admin', 'owner'].includes(req.user?.role)) {
        throw new AppError('Access denied. Admin or owner role required.', 403);
    }
    
    const result = await query(
        `SELECT c.id, c.name, c.created_at, c.updated_at,
                COUNT(DISTINCT b.id) as branch_count,
                COUNT(DISTINCT u.id) as user_count
         FROM companies c
         LEFT JOIN branches b ON b.company_id = c.id
         LEFT JOIN users u ON u.company_id = c.id
         GROUP BY c.id
         ORDER BY c.created_at DESC`
    );
    
    res.json({
        success: true,
        data: result.rows
    });
});