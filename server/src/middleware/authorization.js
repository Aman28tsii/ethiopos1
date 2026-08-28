// server/src/middleware/authorization.js

import { pool } from "../config/database.js";

// ============================================================
// BRANCH AUTHORIZATION - FIXED TO IGNORE QUERY PARAMS FOR STAFF
// ============================================================

export const authorizeBranch = (req, res, next) => {
    const userBranchId = req.user?.branch_id;
    const userRole = req.user?.role;
    const userCompanyId = req.user?.company_id;
    
    // If user is owner/admin, allow branch switching
    if (userRole === 'owner' || userRole === 'admin') {
        const requestedBranchId = req.params.branchId || 
                                  req.body.branchId || 
                                  req.query.branchId;
        
        if (requestedBranchId) {
            // Owner requested a specific branch - validate it
            return validateBranchOwnership(req, res, next, requestedBranchId);
        }
        // No specific branch requested - owner can proceed
        return next();
    }
    
    // Normal staff must have a branch
    if (!userBranchId) {
        return res.status(401).json({
            success: false,
            error: 'User branch not found. Please login again.'
        });
    }
    
    // ✅ FIX: For normal staff, IGNORE all query/body/params branchId
    // Only use the authenticated user's branch_id
    req.branchId = userBranchId;
    
    // ✅ FIX: Don't check query params for staff - just use their JWT branch
    next();
};

// ============================================================
// VALIDATE BRANCH OWNERSHIP (Helper - for owners only)
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
// OTHER EXPORTS (unchanged)
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

export const authorizeTenant = (req, res, next) => {
    authorizeCompany(req, res, (err) => {
        if (err) return next(err);
        authorizeBranch(req, res, next);
    });
};

export const userBelongsToCompany = (req, companyId) => {
    return req.user?.company_id === parseInt(companyId);
};

export const userBelongsToBranch = (req, branchId) => {
    const userRole = req.user?.role;
    if (userRole === 'owner' || userRole === 'admin') {
        return true;
    }
    return req.user?.branch_id === parseInt(branchId);
};

export const requireBranchContext = (req, res, next) => {
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

export const requireCompanyContext = (req, res, next) => {
    if (!req.user?.company_id) {
        return res.status(403).json({
            success: false,
            error: 'Company context required for this operation.'
        });
    }
    next();
};

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

export const validateBranchAccess = async (req, res, next) => {
    const requestedBranchId = req.params.branchId || 
                              req.body.branchId || 
                              req.query.branchId;
    
    if (!requestedBranchId) {
        return next();
    }
    
    const userRole = req.user?.role;
    const userCompanyId = req.user?.company_id;
    
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