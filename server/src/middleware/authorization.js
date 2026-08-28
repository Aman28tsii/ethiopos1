// server/src/middleware/authorization.js

import { pool } from "../config/database.js";

// ============================================================
// COMPANY AUTHORIZATION
// ============================================================

export const authorizeCompany = (req, res, next) => {
    const userCompanyId = req.user?.company_id;
    
    if (!userCompanyId) {
        return res.status(401).json({
            success: false,
            error: 'User company not found. Please login again.'
        });
    }
    
    const requestedCompanyId = req.params.companyId || 
                               req.body.companyId || 
                               req.query.companyId;
    
    if (requestedCompanyId && parseInt(requestedCompanyId) !== userCompanyId) {
        return res.status(403).json({
            success: false,
            error: 'Access denied. Company mismatch.'
        });
    }
    
    req.companyId = userCompanyId;
    next();
};

// ============================================================
// BRANCH AUTHORIZATION - IGNORES QUERY PARAMS FOR EVERYONE
// ============================================================

export const authorizeBranch = (req, res, next) => {
    const userBranchId = req.user?.branch_id;
    const userRole = req.user?.role;
    
    // 🔑 For ALL users: Use JWT branch, IGNORE query params
    // This prevents branchId injection on normal endpoints
    if (!userBranchId) {
        return res.status(401).json({
            success: false,
            error: 'User branch not found. Please login again.'
        });
    }
    
    // ✅ Use ONLY the authenticated user's branch
    // Completely ignore req.query.branchId, req.body.branchId, req.params.branchId
    req.branchId = userBranchId;
    next();
};

// ============================================================
// OWNER BRANCH SELECTION - For /owner endpoints only
// ============================================================

export const validateOwnerBranch = async (req, res, next) => {
    const userRole = req.user?.role;
    const userCompanyId = req.user?.company_id;
    const requestedBranchId = req.query.branchId || req.body.branchId;
    
    // Only owners and admins can use this
    if (userRole !== 'owner' && userRole !== 'admin') {
        return res.status(403).json({
            success: false,
            error: 'Access denied. Owner or admin required.'
        });
    }
    
    // If no branch requested, use their default branch
    if (!requestedBranchId) {
        req.branchId = req.user.branch_id;
        return next();
    }
    
    // Validate the branch belongs to their company
    try {
        const result = await pool.query(
            'SELECT id, name, is_active FROM branches WHERE id = $1 AND company_id = $2',
            [requestedBranchId, userCompanyId]
        );
        
        if (result.rows.length === 0) {
            return res.status(403).json({
                success: false,
                error: 'Branch not accessible for this company.'
            });
        }
        
        if (result.rows[0].is_active === false) {
            return res.status(403).json({
                success: false,
                error: 'Branch is inactive.'
            });
        }
        
        req.branchId = parseInt(requestedBranchId);
        next();
    } catch (error) {
        console.error('Branch validation error:', error);
        return res.status(500).json({
            success: false,
            error: 'Error validating branch access.'
        });
    }
};

// ============================================================
// COMBINED TENANT ISOLATION
// ============================================================

export const authorizeTenant = (req, res, next) => {
    authorizeCompany(req, res, (err) => {
        if (err) return next(err);
        authorizeBranch(req, res, next);
    });
};

// ============================================================
// USER BELONGS TO CHECKS
// ============================================================

export const userBelongsToCompany = (req, companyId) => {
    return req.user?.company_id === parseInt(companyId);
};

export const userBelongsToBranch = (req, branchId) => {
    return req.user?.branch_id === parseInt(branchId);
};

// ============================================================
// CONTEXT REQUIREMENTS
// ============================================================

export const requireBranchContext = (req, res, next) => {
    if (!req.user?.branch_id) {
        return res.status(403).json({
            success: false,
            error: 'Branch context required for this operation.'
        });
    }
    next();
};

export const requireCompanyContext = (req, res, next) => {
    if (!req.user?.company_id) {
        return res.status(403).json({
            success: false,
            error: 'Company context required for this operation.'
        });
    }
    next();
};

// ============================================================
// OWNER HELPERS
// ============================================================

export const getOwnerBranches = async (req, res, next) => {
    if (req.user?.role !== 'owner' && req.user?.role !== 'admin') {
        return next();
    }
    
    try {
        const result = await pool.query(
            'SELECT id, name, address, phone, is_active FROM branches WHERE company_id = $1 ORDER BY name',
            [req.user.company_id]
        );
        req.availableBranches = result.rows;
        next();
    } catch (error) {
        console.error('Get owner branches error:', error);
        next();
    }
};

// ============================================================
// VALIDATE BRANCH ACCESS (Generic)
// ============================================================

export const validateBranchAccess = async (req, res, next) => {
    const requestedBranchId = req.params.branchId || 
                              req.body.branchId || 
                              req.query.branchId;
    
    if (!requestedBranchId) {
        return next();
    }
    
    const userRole = req.user?.role;
    const userCompanyId = req.user?.company_id;
    
    // Normal staff cannot access other branches
    if (userRole !== 'owner' && userRole !== 'admin') {
        if (parseInt(requestedBranchId) !== req.user?.branch_id) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Branch mismatch.'
            });
        }
        req.branchId = parseInt(requestedBranchId);
        return next();
    }
    
    // Owners/admins can access any branch in their company
    try {
        const result = await pool.query(
            'SELECT id FROM branches WHERE id = $1 AND company_id = $2 AND is_active = true',
            [requestedBranchId, userCompanyId]
        );
        
        if (result.rows.length === 0) {
            return res.status(403).json({
                success: false,
                error: 'Branch not accessible.'
            });
        }
        
        req.branchId = parseInt(requestedBranchId);
        next();
    } catch (error) {
        console.error('Branch validation error:', error);
        return res.status(500).json({
            success: false,
            error: 'Error validating branch access.'
        });
    }
};