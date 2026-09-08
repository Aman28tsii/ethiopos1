// server/src/middleware/rateLimiter.js

import rateLimit from 'express-rate-limit';
import { query } from '../config/database.js';

// ============================================================
// RATE LIMIT STORE — PostgreSQL-based shared store
// ============================================================

class PostgresStore {
    constructor(options = {}) {
        this.windowMs = options.windowMs || 60000;
        this.prefix = options.prefix || 'ratelimit:';
    }

    async increment(key) {
        const now = new Date();
        const windowStart = new Date(now.getTime() - this.windowMs);
        
        // First, delete expired entries for this key
        await query(
            'DELETE FROM rate_limit_store WHERE key = $1 AND reset_at < $2',
            [key, windowStart]
        );
        
        // Then insert or update
        const result = await query(
            `INSERT INTO rate_limit_store (key, count, reset_at, created_at, updated_at)
             VALUES ($1, 1, $2, NOW(), NOW())
             ON CONFLICT (key) DO UPDATE 
             SET count = rate_limit_store.count + 1,
                 reset_at = $2,
                 updated_at = NOW()
             WHERE rate_limit_store.key = $1
             RETURNING count`,
            [key, windowStart]
        );
        
        let count = 1;
        if (result.rows.length > 0) {
            count = parseInt(result.rows[0].count);
        } else {
            // If no row returned, try selecting
            const selectResult = await query(
                'SELECT count FROM rate_limit_store WHERE key = $1',
                [key]
            );
            if (selectResult.rows.length > 0) {
                count = parseInt(selectResult.rows[0].count);
            } else {
                // Insert again
                await query(
                    'INSERT INTO rate_limit_store (key, count, reset_at, created_at, updated_at) VALUES ($1, 1, $2, NOW(), NOW())',
                    [key, windowStart]
                );
                count = 1;
            }
        }
        
        return {
            totalHits: count,
            resetTime: new Date(now.getTime() + this.windowMs)
        };
    }

    async decrement(key) {
        await query(
            'UPDATE rate_limit_store SET count = count - 1, updated_at = NOW() WHERE key = $1 AND count > 0',
            [key]
        );
    }

    async resetKey(key) {
        await query('DELETE FROM rate_limit_store WHERE key = $1', [key]);
    }

    async resetAll() {
        await query('DELETE FROM rate_limit_store');
    }
}

// ============================================================
// ENSURE TABLE EXISTS
// ============================================================

export const ensureRateLimitTable = async () => {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS rate_limit_store (
                key VARCHAR(255) PRIMARY KEY,
                count INTEGER DEFAULT 0,
                reset_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await query(`
            CREATE INDEX IF NOT EXISTS idx_rate_limit_reset_at ON rate_limit_store(reset_at)
        `);
        console.log('[RATE_LIMIT] Table verified');
    } catch (err) {
        console.error('[RATE_LIMIT] Table creation error:', err.message);
    }
};

// ============================================================
// CLEANUP OLD RATE LIMIT RECORDS
// ============================================================

export const cleanupRateLimits = async () => {
    try {
        const result = await query(
            'DELETE FROM rate_limit_store WHERE reset_at < NOW() - INTERVAL \'1 hour\''
        );
        if (result.rowCount > 0) {
            console.log(`[RATE_LIMIT] Cleaned up ${result.rowCount} old records`);
        }
    } catch (err) {
        console.error('[RATE_LIMIT] Cleanup error:', err.message);
    }
};

// Run cleanup every hour
setInterval(cleanupRateLimits, 60 * 60 * 1000);

// ============================================================
// RATE LIMITERS
// ============================================================

const store = new PostgresStore({ windowMs: 60 * 1000 });

// CRITICAL: Authentication/Registration
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    store: store,
    message: {
        success: false,
        error: 'Too many authentication attempts. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const forwarded = req.headers['x-forwarded-for'];
        return forwarded ? forwarded.split(',')[0].trim() : req.ip || req.connection.remoteAddress;
    }
});

// HIGH: Mutations (Orders, Payments, Stock, User Management)
export const mutationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    store: store,
    message: {
        success: false,
        error: 'Too many requests. Please slow down and try again.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const forwarded = req.headers['x-forwarded-for'];
        const clientIp = forwarded ? forwarded.split(',')[0].trim() : req.ip || req.connection.remoteAddress;
        const userId = req.user?.id || 'anonymous';
        return `${userId}_${clientIp}`;
    },
    skip: (req) => {
        return req.path === '/health' || req.path === '/';
    }
});

// ONBOARDING: Company Creation
export const onboardLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    store: store,
    message: {
        success: false,
        error: 'Too many company creation requests. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const forwarded = req.headers['x-forwarded-for'];
        return forwarded ? forwarded.split(',')[0].trim() : req.ip || req.connection.remoteAddress;
    }
});

// MEDIUM: Read Operations
export const readLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    store: store,
    message: {
        success: false,
        error: 'Too many requests. Please slow down.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        return req.path === '/health' || req.path === '/';
    },
    keyGenerator: (req) => {
        const forwarded = req.headers['x-forwarded-for'];
        const clientIp = forwarded ? forwarded.split(',')[0].trim() : req.ip || req.connection.remoteAddress;
        const userId = req.user?.id || 'anonymous';
        return `${userId}_${clientIp}`;
    }
});