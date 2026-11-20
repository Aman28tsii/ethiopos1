// server/src/middleware/idempotency.js

import { query } from '../config/database.js';
import crypto from 'crypto';

const IDEMPOTENCY_HEADER = 'idempotency-key';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// In-memory cache for quick lookups
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

// Generate request hash from payload
const generateRequestHash = (body) => {
    const canonical = JSON.stringify(body, Object.keys(body).sort());
    return crypto.createHash('sha256').update(canonical).digest('hex');
};

// Ensure idempotency_records table exists
export const ensureIdempotencyTable = async () => {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS idempotency_records (
                id SERIAL PRIMARY KEY,
                idempotency_key VARCHAR(255) NOT NULL,
                company_id INTEGER NOT NULL,
                branch_id INTEGER NOT NULL,
                resource_type VARCHAR(50) NOT NULL,
                resource_id VARCHAR(255),
                request_hash TEXT,
                response_data JSONB,
                status_code INTEGER,
                status VARCHAR(20) DEFAULT 'processing',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(idempotency_key, company_id, branch_id, resource_type)
            )
        `);
        console.log('[IDEMPOTENCY] Table verified');
    } catch (err) {
        console.error('[IDEMPOTENCY] Table creation error:', err.message);
    }
};

// Get cached result from database
const getCachedResult = async (idempotencyKey, companyId, branchId, resourceType = 'order') => {
    try {
        const result = await query(
            `SELECT response_data, status_code, status, request_hash
             FROM idempotency_records 
             WHERE idempotency_key = $1 
               AND company_id = $2 
               AND branch_id = $3 
               AND resource_type = $4
               AND status = 'completed'`,
            [idempotencyKey, companyId, branchId, resourceType]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('[IDEMPOTENCY] Database lookup error:', err.message);
        return null;
    }
};

// Export a helper so handlers can update the memory cache after writing the
// idempotency record themselves (D3 fix).
export const cacheSet = (cacheKey, status, data, requestHash) => {
    memoryCache.set(cacheKey, {
        status: status || 200,
        data: data,
        requestHash: requestHash,
        timestamp: Date.now()
    });
};

// Get resource type from request path
const getResourceType = (req) => {
    const path = req.path;
    
    if (path.includes('/pay') && !path.includes('/payment')) {
        return 'payment';
    }
    if (path.includes('/qr-order')) {
        return 'qr_order';
    }
    if (path.includes('/orders') || path.includes('/order')) {
        return 'order';
    }
    if (path.includes('/sales') || path.includes('/sale')) {
        return 'sale';
    }
    if (path.includes('/adjust-stock')) {
        return 'stock_adjustment';
    }
    if (path.includes('/ingredients')) {
        return 'stock_adjustment';
    }
    return 'order';
};

// ============================================================
// Resolve tenant context for the current request.
//
// Order of precedence:
//   1. Authenticated user (req.user.company_id / branch_id)
//   2. Request body's table_id → look up tables row
//
// Never falls back to any hardcoded company or branch.
// Returns { companyId, branchId } or null if no context can be
// resolved. Callers must handle the null case.
// ============================================================
const resolveTenantContext = async (req) => {
    // 1. Authenticated user (staff endpoints)
    const userCompanyId = req.user?.company_id;
    const userBranchId  = req.user?.branch_id;

    if (userCompanyId && userBranchId) {
        return { companyId: userCompanyId, branchId: userBranchId };
    }

    // 2. Public QR flow — derive tenant from the table
    const tableId = req.body?.table_id;
    if (tableId === undefined || tableId === null || tableId === '') {
        return null;
    }

    const numericTableId = parseInt(tableId, 10);
    if (!Number.isFinite(numericTableId) || numericTableId <= 0) {
        return null;
    }

    try {
        const tableResult = await query(
            `SELECT id, company_id, branch_id FROM tables WHERE id = $1`,
            [numericTableId]
        );
        if (tableResult.rows.length === 0) {
            return null;
        }
        const table = tableResult.rows[0];
        if (!table.company_id || !table.branch_id) {
            return null;
        }
        return { companyId: table.company_id, branchId: table.branch_id };
    } catch (err) {
        console.error('[IDEMPOTENCY] Table lookup error:', err.message);
        return null;
    }
};

// ============================================================
// Idempotency middleware — D3 fix.
//
// The middleware no longer acquires a DB client, no longer opens
// a transaction, and no longer writes/commits the idempotency
// record. It only:
//   1. Reads the Idempotency-Key header.
//   2. Resolves tenant context.
//   3. Checks memory + database for a completed record.
//   4. Attaches req.idempotencyContext and calls next().
//
// The handler is responsible for inserting the completed
// idempotency record inside its own business transaction. Both
// rows commit atomically, so there is no window where the
// business row is durable and the idempotency row is not.
// ============================================================
export const idempotent = (req, res, next) => {
    const idempotencyKey = req.headers[IDEMPOTENCY_HEADER];
    
    if (!idempotencyKey) {
        return next();
    }

    const resourceType = getResourceType(req);
    const requestHash = generateRequestHash(req.body);

    resolveTenantContext(req)
        .then(async (tenant) => {
            if (!tenant) {
                return res.status(401).json({
                    success: false,
                    error: 'Unable to resolve company context for idempotent operation'
                });
            }

            const { companyId, branchId } = tenant;
            const cacheKey = getCacheKey(idempotencyKey, companyId, branchId, resourceType);

            // Check memory cache first
            const cached = memoryCache.get(cacheKey);
            if (cached) {
                if (cached.requestHash === requestHash) {
                    return res.status(cached.status).json(cached.data);
                } else {
                    return res.status(409).json({
                        success: false,
                        error: 'Idempotency key reused with different request payload',
                        idempotency_key: idempotencyKey
                    });
                }
            }

            // Check database for cached result
            const cachedResult = await getCachedResult(idempotencyKey, companyId, branchId, resourceType);
            if (cachedResult) {
                if (cachedResult.request_hash !== requestHash) {
                    return res.status(409).json({
                        success: false,
                        error: 'Idempotency key reused with different request payload',
                        idempotency_key: idempotencyKey
                    });
                }
                memoryCache.set(cacheKey, {
                    status: cachedResult.status_code || 200,
                    data: cachedResult.response_data,
                    requestHash: cachedResult.request_hash,
                    timestamp: Date.now()
                });
                return res.status(cachedResult.status_code || 200).json(cachedResult.response_data);
            }

            // No cached result — hand off to the handler.
            // The handler will insert the completed idempotency record
            // inside its own business transaction.
            req.idempotencyContext = {
                key: idempotencyKey,
                companyId,
                branchId,
                resourceType,
                requestHash,
                cacheKey
            };

            next();
        })
        .catch((err) => {
            console.error('[IDEMPOTENCY] Processing error:', err);
            res.status(500).json({
                success: false,
                error: 'Internal server error during idempotency processing'
            });
        });
};

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

export const getIdempotencyKey = (req) => {
    return req.headers[IDEMPOTENCY_HEADER] || null;
};

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

setInterval(cleanupIdempotencyRecords, 6 * 60 * 60 * 1000);