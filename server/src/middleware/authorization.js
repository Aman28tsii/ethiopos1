// server/src/middleware/authorization.js

import { pool } from "../config/database.js";

// ============================================================
// TENANT ISOLATION MIDDLEWARE
// ============================================================

export const authorizeCompany = (req, res, next) => {
    const userCompanyId = req.user?.company_id;
    
    if (!userCompanyId) {
        return res.status(401).json({
            success: false,
            error: 'User company not found. Please login again.'
        });
    }
    
    // Extract requested company_id from params, body, or query
    const requestedCompanyId = req.params.companyId || 
                               req.body.companyId || 
                               req.query.companyId;
    
    // If a company_id is explicitly requested, verify it matches the user's
    if (requestedCompanyId && parseInt(requestedCompanyId) !== userCompanyId) {
        return res.status(403).json({
            success: false,
            error: 'Access denied. Company mismatch.'
        });
    }
    
    // Attach company_id to the request for use in queries
    req.companyId = userCompanyId;
    next();
};

export const authorizeBranch = (req, res, next) => {
    const userBranchId = req.user?.branch_id;
    const userRole = req.user?.role;
    const userCompanyId = req.user?.company_id;
    
    // If user is owner/admin, they can access branches of their company
    if (userRole === 'owner' || userRole === 'admin') {
        // Owner can access branches - they need to explicitly request one
        // If no branch requested, they get all branches (handled by controller)
        // For branch-restricted endpoints, we still validate the requested branch
        const requestedBranchId = req.params.branchId || 
                                  req.body.branchId || 
                                  req.query.branchId;
        
        if (requestedBranchId) {
            // Owner requested a specific branch - validate it belongs to their company
            return validateBranchOwnership(req, res, next, requestedBranchId);
        }
        
        // No specific branch requested - owner can proceed (controller will handle)
        return next();
    }
    
    // Normal staff must have a branch
    if (!userBranchId) {
        return res.status(401).json({
            success: false,
            error: 'User branch not found. Please login again.'
        });
    }
    
    // Extract requested branch_id from params, body, or query
    const requestedBranchId = req.params.branchId || 
                              req.body.branchId || 
                              req.query.branchId;
    
    // If a branch_id is explicitly requested, verify it matches the user's
    if (requestedBranchId && parseInt(requestedBranchId) !== userBranchId) {
        return res.status(403).json({
            success: false,
            error: 'Access denied. Branch mismatch.'
        });
    }
    
    // Attach branch_id to the request for use in queries
    req.branchId = userBranchId;
    next();
};

// ============================================================
// VALIDATE BRANCH OWNERSHIP (Helper)
// ============================================================

const validateBranchOwnership = async (req, res, next, branchId) => {
    const userCompanyId = req.user?.company_id;
    
    if (!userCompanyId) {
        return res.status(401).json({
            success: false,
            error: 'User company not found. Please login again.'
        });
    }
    
    try {
        const result = await pool.query(
            'SELECT id, name, is_active FROM branches WHERE id = $1 AND company_id = $2',
            [branchId, userCompanyId]
        );
        
        if (result.rows.length === 0) {
            return res.status(403).json({
                success: false,
                error: 'Branch not accessible for this company.'
            });
        }
        
        if (!result.rows[0].is_active) {
            return res.status(403).json({
                success: false,
                error: 'Branch is inactive.'
            });
        }
        
        req.branchId = parseInt(branchId);
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
    // First authorize company
    authorizeCompany(req, res, (err) => {
        if (err) return next(err);
        // Then authorize branch
        authorizeBranch(req, res, next);
    });
};

// ============================================================
// CHECK IF USER BELONGS TO COMPANY
// ============================================================

export const userBelongsToCompany = (req, companyId) => {
    return req.user?.company_id === parseInt(companyId);
};

export const userBelongsToBranch = (req, branchId) => {
    const userRole = req.user?.role;
    if (userRole === 'owner' || userRole === 'admin') {
        return true; // Owner/admin can access any branch
    }
    return req.user?.branch_id === parseInt(branchId);
};

// ============================================================
// MIDDLEWARE TO ENSURE BRANCH CONTEXT
// ============================================================

export const requireBranchContext = (req, res, next) => {
    // Skip for owner/admin
    if (req.user?.role === 'owner' || req.user?.role === 'admin') {
        return next();
    }
    
    if (!req.user?.branch_id) {
        return res.status(403).json({
            success: false,
            error: 'Branch context required for this operation.'
        });
    }
    
    next();
};

// ============================================================
// MIDDLEWARE TO ENSURE COMPANY CONTEXT
// ============================================================

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
// GET ALL BRANCHES FOR OWNER (Company-wide)
// ============================================================

export const getOwnerBranches = async (req, res, next) => {
    if (req.user?.role !== 'owner' && req.user?.role !== 'admin') {
        return next(); // Not owner, continue without adding branches
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
// VALIDATE BRANCH ACCESS (For Owner branch switching)
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
    
    // For normal staff, just verify it matches their branch
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
    
    // For owner, verify branch belongs to their company
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