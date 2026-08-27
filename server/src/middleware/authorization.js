// server/src/middleware/authorization.js

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
    
    // If user is owner/admin, they can access all branches of their company
    if (userRole === 'owner' || userRole === 'admin') {
        // Owner has no branch restriction
        return next();
    }
    
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