// server/src/middleware/idempotency.js
import { query } from '../config/database.js';

const IDEMPOTENCY_HEADER = 'idempotency-key';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// In-memory cache for quick lookups (reduces DB hits)
const memoryCache = new Map();

// Cleanup old memory cache entries
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryCache) {
        if (now - entry.timestamp > CACHE_TTL) {
            memoryCache.delete(key);
        }
    }
}, 60 * 60 * 1000);

const getCacheKey = (key, companyId, branchId, resourceType = 'order') => {
    return `${key}_${companyId}_${branchId}_${resourceType}`;
};

// Get cached result from database
const getCachedResult = async (idempotencyKey, companyId, branchId, resourceType = 'order') => {
    try {
        const result = await query(
            `SELECT response_data, status_code 
             FROM idempotency_records 
             WHERE idempotency_key = $1 
               AND company_id = $2 
               AND branch_id = $3 
               AND resource_type = $4`,
            [idempotencyKey, companyId, branchId, resourceType]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('[IDEMPOTENCY] Database lookup error:', err.message);
        return null;
    }
};

// Store result in database
const storeResult = async (idempotencyKey, companyId, branchId, resourceType, resourceId, responseData, statusCode) => {
    try {
        await query(
            `INSERT INTO idempotency_records 
             (idempotency_key, company_id, branch_id, resource_type, resource_id, response_data, status_code, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
             ON CONFLICT (idempotency_key, company_id, branch_id, resource_type) 
             DO UPDATE SET 
               response_data = EXCLUDED.response_data,
               status_code = EXCLUDED.status_code,
               updated_at = NOW()`,
            [idempotencyKey, companyId, branchId, resourceType, resourceId, responseData, statusCode]
        );
        console.log(`[IDEMPOTENCY] Stored result for ${idempotencyKey} in database`);
    } catch (err) {
        console.error('[IDEMPOTENCY] Failed to store result:', err.message);
    }
};

// Idempotency middleware - enhanced with database storage
export const idempotent = (req, res, next) => {
    const idempotencyKey = req.headers[IDEMPOTENCY_HEADER];
    
    // Skip if no key
    if (!idempotencyKey) {
        return next();
    }

    const companyId = req.user?.company_id || 1;
    const branchId = req.user?.branch_id || 1;
    const resourceType = req.path.includes('orders') ? 'order' : 
                         req.path.includes('pay') ? 'payment' : 
                         req.path.includes('sale') ? 'sale' : 'order';
    const cacheKey = getCacheKey(idempotencyKey, companyId, branchId, resourceType);

    // Check memory cache first (fast path)
    const cached = memoryCache.get(cacheKey);
    if (cached) {
        console.log(`[IDEMPOTENCY] Memory cache hit for ${idempotencyKey}`);
        return res.status(cached.status).json(cached.data);
    }

    // Check database cache (slow path but persistent)
    getCachedResult(idempotencyKey, companyId, branchId, resourceType)
        .then(dbResult => {
            if (dbResult) {
                console.log(`[IDEMPOTENCY] Database cache hit for ${idempotencyKey}`);
                // Store in memory cache for future
                memoryCache.set(cacheKey, {
                    status: dbResult.status_code,
                    data: dbResult.response_data,
                    timestamp: Date.now()
                });
                return res.status(dbResult.status_code).json(dbResult.response_data);
            }
            
            // No cache hit, proceed to handler
            // Store the original response methods
            const originalJson = res.json.bind(res);
            const originalSend = res.send.bind(res);
            const originalStatus = res.status.bind(res);
            let statusCode = 200;
            let responseSent = false;

            // Override status
            res.status = function(code) {
                statusCode = code;
                return originalStatus(code);
            };

            // Override json
            res.json = function(data) {
                if (!responseSent && statusCode >= 200 && statusCode < 300) {
                    responseSent = true;
                    const resourceId = data?.data?.order_id || data?.data?.sale_id || data?.data?.id || null;
                    // Store in database asynchronously
                    storeResult(idempotencyKey, companyId, branchId, resourceType, resourceId, data, statusCode);
                    
                    // Store in memory cache
                    memoryCache.set(cacheKey, {
                        status: statusCode,
                        data: data,
                        timestamp: Date.now()
                    });
                }
                return originalJson(data);
            };

            // Override send
            res.send = function(data) {
                if (!responseSent && statusCode >= 200 && statusCode < 300) {
                    responseSent = true;
                    try {
                        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
                        const resourceId = parsed?.data?.order_id || parsed?.data?.sale_id || parsed?.data?.id || null;
                        storeResult(idempotencyKey, companyId, branchId, resourceType, resourceId, parsed, statusCode);
                        memoryCache.set(cacheKey, {
                            status: statusCode,
                            data: parsed,
                            timestamp: Date.now()
                        });
                    } catch (e) {
                        // Not JSON, don't cache
                        console.log('[IDEMPOTENCY] Non-JSON response, not caching');
                    }
                }
                return originalSend(data);
            };

            next();
        })
        .catch(err => {
            console.error('[IDEMPOTENCY] Database check error:', err.message);
            // On error, proceed to handler (fail open)
            next();
        });
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

// Clean up old idempotency records (run periodically)
export const cleanupIdempotencyRecords = async () => {
    try {
        const result = await query(
            `DELETE FROM idempotency_records 
             WHERE created_at < NOW() - INTERVAL '7 days'`
        );
        console.log(`[IDEMPOTENCY] Cleaned up ${result.rowCount} old records`);
    } catch (err) {
        console.error('[IDEMPOTENCY] Cleanup error:', err.message);
    }
};

// Run cleanup every 6 hours
setInterval(cleanupIdempotencyRecords, 6 * 60 * 60 * 1000);