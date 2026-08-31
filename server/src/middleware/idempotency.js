// server/src/middleware/idempotency.js
// NEW FILE

import { query } from '../config/database.js';

// Idempotency key header
const IDEMPOTENCY_HEADER = 'idempotency-key';

// Store idempotency results (in-memory cache with TTL)
// In production, this should be Redis or a database table
const idempotencyCache = new Map();

// Cleanup old entries every hour
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of idempotencyCache) {
        if (now - entry.timestamp > 24 * 60 * 60 * 1000) { // 24 hours
            idempotencyCache.delete(key);
        }
    }
}, 60 * 60 * 1000);

// Generate cache key
const getCacheKey = (key, companyId, branchId) => {
    return `${key}_${companyId}_${branchId}`;
};

// Idempotency middleware
export const idempotent = (req, res, next) => {
    const idempotencyKey = req.headers[IDEMPOTENCY_HEADER];
    
    // Skip if no key provided (optional)
    if (!idempotencyKey) {
        return next();
    }

    const companyId = req.user?.company_id || 1;
    const branchId = req.user?.branch_id || 1;
    const cacheKey = getCacheKey(idempotencyKey, companyId, branchId);

    // Check if we've seen this request before
    const cached = idempotencyCache.get(cacheKey);
    if (cached) {
        console.log(`[IDEMPOTENCY] Return cached result for ${idempotencyKey}`);
        return res.status(cached.status).json(cached.data);
    }

    // Store the original response methods
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    const originalStatus = res.status.bind(res);

    // Override status to capture the status code
    let statusCode = 200;
    res.status = function(code) {
        statusCode = code;
        return originalStatus(code);
    };

    // Override json to cache the response
    res.json = function(data) {
        // Cache the result for non-error responses
        if (statusCode >= 200 && statusCode < 300) {
            console.log(`[IDEMPOTENCY] Caching result for ${idempotencyKey}`);
            idempotencyCache.set(cacheKey, {
                status: statusCode,
                data: data,
                timestamp: Date.now()
            });
        }
        return originalJson(data);
    };

    // Also handle send for string responses
    res.send = function(data) {
        if (statusCode >= 200 && statusCode < 300) {
            console.log(`[IDEMPOTENCY] Caching result for ${idempotencyKey}`);
            idempotencyCache.set(cacheKey, {
                status: statusCode,
                data: data,
                timestamp: Date.now()
            });
        }
        return originalSend(data);
    };

    next();
};

// Middleware to enforce idempotency for certain routes
export const requireIdempotency = (req, res, next) => {
    const idempotencyKey = req.headers[IDEMPOTENCY_HEADER];
    if (!idempotencyKey) {
        return res.status(400).json({
            success: false,
            error: 'Idempotency-Key header is required for this operation'
        });
    }
    next();
};

// Get idempotency key from request
export const getIdempotencyKey = (req) => {
    return req.headers[IDEMPOTENCY_HEADER] || null;
};