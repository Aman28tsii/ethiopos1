// server/src/middleware/idempotency.js

import { query, getClient } from '../config/database.js';
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

// Get cached result from database
const getCachedResult = async (idempotencyKey, companyId, branchId, resourceType = 'order') => {
    try {
        const result = await query(
            `SELECT response_data, status_code, status, request_hash
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

// Atomically claim idempotency key
const claimIdempotencyKey = async (client, idempotencyKey, companyId, branchId, resourceType, requestHash) => {
    try {
        await client.query(
            `INSERT INTO idempotency_records 
             (idempotency_key, company_id, branch_id, resource_type, request_hash, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, 'processing', NOW(), NOW())`,
            [idempotencyKey, companyId, branchId, resourceType, requestHash]
        );
        return { claimed: true, existing: null };
    } catch (err) {
        if (err.code === '23505') {
            const existing = await client.query(
                `SELECT response_data, status_code, status, request_hash
                 FROM idempotency_records 
                 WHERE idempotency_key = $1 
                   AND company_id = $2 
                   AND branch_id = $3 
                   AND resource_type = $4`,
                [idempotencyKey, companyId, branchId, resourceType]
            );
            
            if (existing.rows.length > 0) {
                const record = existing.rows[0];
                if (record.request_hash !== requestHash) {
                    return { 
                        claimed: false, 
                        existing: null, 
                        conflict: true 
                    };
                }
                return { claimed: false, existing: record };
            }
        }
        throw err;
    }
};

// Store result in database
const storeResult = async (client, idempotencyKey, companyId, branchId, resourceType, resourceId, responseData, statusCode) => {
    await client.query(
        `UPDATE idempotency_records 
         SET response_data = $1, 
             status_code = $2, 
             resource_id = $3,
             status = 'completed',
             updated_at = NOW()
         WHERE idempotency_key = $4 
           AND company_id = $5 
           AND branch_id = $6 
           AND resource_type = $7`,
        [responseData, statusCode, resourceId, idempotencyKey, companyId, branchId, resourceType]
    );
    console.log(`[IDEMPOTENCY] Stored result for ${idempotencyKey}`);
};

// Mark as failed
const markFailed = async (client, idempotencyKey, companyId, branchId, resourceType) => {
    await client.query(
        `UPDATE idempotency_records 
         SET status = 'failed',
             updated_at = NOW()
         WHERE idempotency_key = $1 
           AND company_id = $2 
           AND branch_id = $3 
           AND resource_type = $4`,
        [idempotencyKey, companyId, branchId, resourceType]
    );
};

// ✅ FIX: Added stock_adjustment resource type detection
const getResourceType = (req) => {
    if (req.path.includes('/orders')) return 'order';
    if (req.path.includes('/pay')) return 'payment';
    if (req.path.includes('/sales')) return 'sale';
    if (req.path.includes('/adjust-stock')) return 'stock_adjustment';
    return 'order';
};

// Idempotency middleware
export const idempotent = (req, res, next) => {
    const idempotencyKey = req.headers[IDEMPOTENCY_HEADER];
    
    if (!idempotencyKey) {
        return next();
    }

    const companyId = req.user?.company_id;
    const branchId = req.user?.branch_id;
    
    if (!companyId || !branchId) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required for idempotent operations'
        });
    }

    const resourceType = getResourceType(req);
    const requestHash = generateRequestHash(req.body);
    const cacheKey = getCacheKey(idempotencyKey, companyId, branchId, resourceType);

    // Check memory cache first
    const cached = memoryCache.get(cacheKey);
    if (cached) {
        console.log(`[IDEMPOTENCY] Memory cache hit for ${idempotencyKey}`);
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

    const clientPromise = getClient();
    
    clientPromise.then(async (client) => {
        try {
            await client.query('BEGIN');
            
            const claim = await claimIdempotencyKey(client, idempotencyKey, companyId, branchId, resourceType, requestHash);
            
            if (!claim.claimed && claim.existing) {
                await client.query('COMMIT');
                const record = claim.existing;
                memoryCache.set(cacheKey, {
                    status: record.status_code,
                    data: record.response_data,
                    requestHash: record.request_hash,
                    timestamp: Date.now()
                });
                return res.status(record.status_code).json(record.response_data);
            }
            
            if (!claim.claimed && claim.conflict) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    success: false,
                    error: 'Idempotency key reused with different request payload',
                    idempotency_key: idempotencyKey
                });
            }
            
            // We have successfully claimed the key
            const originalJson = res.json.bind(res);
            const originalSend = res.send.bind(res);
            const originalStatus = res.status.bind(res);
            let statusCode = 200;
            let responseSent = false;

            res.status = function(code) {
                statusCode = code;
                return originalStatus(code);
            };

            res.json = function(data) {
                if (!responseSent) {
                    responseSent = true;
                    const resourceId = data?.data?.id || data?.data?.order_id || data?.data?.sale_id || null;
                    
                    if (statusCode >= 200 && statusCode < 300) {
                        storeResult(client, idempotencyKey, companyId, branchId, resourceType, resourceId, data, statusCode)
                            .then(() => client.query('COMMIT').catch(err => console.error('[IDEMPOTENCY] Commit error:', err)))
                            .catch(async (err) => {
                                console.error('[IDEMPOTENCY] Store result error:', err);
                                await markFailed(client, idempotencyKey, companyId, branchId, resourceType);
                                await client.query('ROLLBACK');
                            });
                        
                        memoryCache.set(cacheKey, {
                            status: statusCode,
                            data: data,
                            requestHash: requestHash,
                            timestamp: Date.now()
                        });
                    } else {
                        markFailed(client, idempotencyKey, companyId, branchId, resourceType)
                            .then(() => client.query('COMMIT').catch(err => console.error('[IDEMPOTENCY] Commit error:', err)))
                            .catch(async (err) => {
                                console.error('[IDEMPOTENCY] Mark failed error:', err);
                                await client.query('ROLLBACK');
                            });
                    }
                }
                return originalJson(data);
            };

            res.send = function(data) {
                if (!responseSent) {
                    responseSent = true;
                    if (statusCode >= 200 && statusCode < 300) {
                        try {
                            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
                            const resourceId = parsed?.data?.id || parsed?.data?.order_id || parsed?.data?.sale_id || null;
                            
                            storeResult(client, idempotencyKey, companyId, branchId, resourceType, resourceId, parsed, statusCode)
                                .then(() => client.query('COMMIT').catch(err => console.error('[IDEMPOTENCY] Commit error:', err)))
                                .catch(async (err) => {
                                    console.error('[IDEMPOTENCY] Store result error:', err);
                                    await markFailed(client, idempotencyKey, companyId, branchId, resourceType);
                                    await client.query('ROLLBACK');
                                });
                            
                            memoryCache.set(cacheKey, {
                                status: statusCode,
                                data: parsed,
                                requestHash: requestHash,
                                timestamp: Date.now()
                            });
                        } catch (e) {
                            client.query('COMMIT').catch(err => console.error('[IDEMPOTENCY] Commit error:', err));
                        }
                    } else {
                        markFailed(client, idempotencyKey, companyId, branchId, resourceType)
                            .then(() => client.query('COMMIT').catch(err => console.error('[IDEMPOTENCY] Commit error:', err)))
                            .catch(async (err) => {
                                console.error('[IDEMPOTENCY] Mark failed error:', err);
                                await client.query('ROLLBACK');
                            });
                    }
                }
                return originalSend(data);
            };

            next();

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('[IDEMPOTENCY] Transaction error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error during idempotency processing'
            });
        } finally {
            client.release();
        }
    }).catch((err) => {
        console.error('[IDEMPOTENCY] Client connection error:', err);
        res.status(500).json({
            success: false,
            error: 'Database connection error during idempotency processing'
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