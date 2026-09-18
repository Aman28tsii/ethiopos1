// server/src/controllers/companyController.js

import bcrypt from 'bcryptjs';
import { query, getClient } from '../config/database.js';
import { AppError, catchAsync } from '../middleware/errorHandler.js';

const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// ============================================================
// ONBOARD COMPANY (Company → Branch → Owner)
// Now creates a PENDING registration. No token. No auto-login.
// ============================================================
export const onboardCompany = catchAsync(async (req, res) => {
    const { company, branch, owner } = req.body;

    // ============================================
    // STEP 1: VALIDATION (Before BEGIN)
    // ============================================

    if (!company?.name || company.name.trim().length < 2) {
        throw new AppError('Company name must be at least 2 characters', 400);
    }
    const companyName = company.name.trim();

    if (!branch?.name || branch.name.trim().length < 1) {
        throw new AppError('Branch name is required', 400);
    }
    const branchName = branch.name.trim();
    const branchAddress = branch.address?.trim() || null;
    const branchPhone = branch.phone?.trim() || null;

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

    const existingEmail = await query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
        [ownerEmail]
    );
    if (existingEmail.rows.length > 0) {
        throw new AppError('Email already registered', 409);
    }

    const existingCompany = await query(
        'SELECT id FROM companies WHERE LOWER(name) = LOWER($1)',
        [companyName]
    );
    if (existingCompany.rows.length > 0) {
        throw new AppError('Company name already exists', 409);
    }

    // ✅ NEW: block duplicate pending registration for the same email
    const existingPending = await query(
        `SELECT id FROM registration_requests
          WHERE LOWER(owner_email) = LOWER($1) AND status = 'pending'`,
        [ownerEmail]
    );
    if (existingPending.rows.length > 0) {
        throw new AppError('A pending registration already exists for this email', 409);
    }

    // ============================================
    // STEP 3: BEGIN TRANSACTION
    // ============================================

    const client = await getClient();

    try {
        await client.query('BEGIN');

        // ============================================
        // STEP 4: CREATE COMPANY (unapproved)
        // ============================================
        const companyResult = await client.query(
            `INSERT INTO companies (name, is_approved, created_at, updated_at)
             VALUES ($1, false, NOW(), NOW())
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
        // STEP 7: CREATE OWNER (pending + inactive)
        // ============================================
        const userResult = await client.query(
            `INSERT INTO users (
                business_id, company_id, branch_id, name, email, password,
                role, phone, status, is_active, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, 'owner', $7, 'pending', false, NOW(), NOW())
            RETURNING id, name, email, role, status, company_id, branch_id, created_at`,
            [1, companyId, branchId, ownerName, ownerEmail, hashedPassword, ownerPhone]
        );
        const userId = userResult.rows[0].id;

        // ============================================
        // STEP 8: CREATE REGISTRATION REQUEST
        // ============================================
        const requestResult = await client.query(
            `INSERT INTO registration_requests (
                company_name, branch_name, branch_address, branch_phone,
                owner_name, owner_email, owner_phone,
                status, company_id, branch_id, owner_id,
                created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10, NOW(), NOW())
            RETURNING id, created_at`,
            [
                companyName, branchName, branchAddress, branchPhone,
                ownerName, ownerEmail, ownerPhone,
                companyId, branchId, userId,
            ]
        );

        // ============================================
        // STEP 9: COMMIT
        // ============================================
        await client.query('COMMIT');

        // ============================================
        // STEP 10: SUCCESS RESPONSE — NO TOKEN, NO LOGIN
        // ============================================
        return res.status(201).json({
            success: true,
            message: 'Your registration has been submitted and is waiting for approval.',
            data: {
                registration_id: requestResult.rows[0].id,
                company: { id: companyId, name: companyName },
                branch:  { id: branchId,  name: branchName },
                owner:   { id: userId, name: ownerName, email: ownerEmail, status: 'pending' },
                status: 'pending',
            },
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
// GET COMPANY BY ID (With branch and owner info) — unchanged
// ============================================================
export const getCompanyInfo = catchAsync(async (req, res) => {
    const { id } = req.params;
    const companyId = parseInt(id);

    if (!companyId || isNaN(companyId)) {
        throw new AppError('Invalid company ID', 400);
    }

    const companyResult = await query(
        'SELECT id, name, logo_url, created_at, updated_at FROM companies WHERE id = $1',
        [companyId]
    );

    if (companyResult.rows.length === 0) {
        throw new AppError('Company not found', 404);
    }

    const branchesResult = await query(
        `SELECT id, name, address, phone, is_active, created_at
         FROM branches WHERE company_id = $1
         ORDER BY name`,
        [companyId]
    );

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
// LIST ALL COMPANIES (Admin/Owner only) — unchanged
// ============================================================
export const listCompanies = catchAsync(async (req, res) => {
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

// ============================================================
// UPDATE COMPANY BRANDING (Owner only, tenant-scoped)
// Accepts { logo_url }. Company name is intentionally not editable
// here — we reuse the existing name field. Only the logo changes.
// The :id in the URL is validated against req.user.company_id;
// a caller can never modify another tenant's branding.
// ============================================================
export const updateCompanyBranding = catchAsync(async (req, res) => {
    const { id } = req.params;
    const numericId = parseInt(id, 10);

    if (!Number.isFinite(numericId) || numericId <= 0) {
        throw new AppError('Invalid company ID', 400);
    }

    if (numericId !== req.user?.company_id) {
        throw new AppError('Company not found', 404);
    }

    const { logo_url } = req.body || {};

    if (logo_url !== null && logo_url !== undefined && typeof logo_url !== 'string') {
        throw new AppError('logo_url must be a string or null', 400);
    }

    let normalizedLogoUrl = null;
    if (typeof logo_url === 'string') {
        const trimmed = logo_url.trim();
        if (trimmed.length > 0) {
            if (trimmed.length > 2048) {
                throw new AppError('logo_url is too long', 400);
            }
            normalizedLogoUrl = trimmed;
        }
    }

    const result = await query(
        `UPDATE companies
            SET logo_url = $1,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING id, name, logo_url, updated_at`,
        [normalizedLogoUrl, numericId]
    );

    if (result.rows.length === 0) {
        throw new AppError('Company not found', 404);
    }

    res.json({
        success: true,
        message: 'Branding updated successfully',
        data: {
            company: result.rows[0]
        }
    });
});