// server/src/middleware/validatePagination.js

export const validatePagination = (req, res, next) => {
    const { page, limit, offset } = req.query;

    // Strict validation: must be a string of digits only (no decimals, letters, or negative signs)
    const isPositiveInt = (val) => /^\d+$/.test(val) && parseInt(val, 10) >= 1;
    const isNonNegativeInt = (val) => /^\d+$/.test(val) && parseInt(val, 10) >= 0;

    // 1. Validate 'page'
    if (page !== undefined && page !== '' && !isPositiveInt(page)) {
        return res.status(400).json({ 
            success: false, 
            error: 'Invalid query parameter: "page" must be a positive integer.' 
        });
    }

    // 2. Validate 'limit'
    if (limit !== undefined && limit !== '' && !isPositiveInt(limit)) {
        return res.status(400).json({ 
            success: false, 
            error: 'Invalid query parameter: "limit" must be a positive integer.' 
        });
    }

    // 3. Validate 'offset'
    if (offset !== undefined && offset !== '' && !isNonNegativeInt(offset)) {
        return res.status(400).json({ 
            success: false, 
            error: 'Invalid query parameter: "offset" must be a non-negative integer.' 
        });
    }

    // 4. Safe coercion for SQL (only reached if validation passes)
    if (page !== undefined && page !== '') {
        req.query.page = parseInt(page, 10);
    }
    if (limit !== undefined && limit !== '') {
        const parsedLimit = parseInt(limit, 10);
        req.query.limit = parsedLimit > 100 ? 100 : parsedLimit; // Enforce maximum page size of 100
    }
    if (offset !== undefined && offset !== '') {
        req.query.offset = parseInt(offset, 10);
    }

    next();
};