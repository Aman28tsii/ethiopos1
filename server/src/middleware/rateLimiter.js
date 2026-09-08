// server/src/middleware/rateLimiter.js

import rateLimit from 'express-rate-limit';

// ============================================================
// CRITICAL: Authentication/Registration
// ============================================================

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 20,                    // 20 requests
    message: {
        success: false,
        error: 'Too many authentication attempts. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.ip || req.connection.remoteAddress;
    }
});

// ============================================================
// HIGH: Mutations (Orders, Payments, Stock, User Management)
// ============================================================

export const mutationLimiter = rateLimit({
    windowMs: 60 * 1000,        // 1 minute
    max: 30,                    // 30 requests per minute
    message: {
        success: false,
        error: 'Too many requests. Please slow down and try again.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // For authenticated users, use user ID + IP combination
        // This prevents one user from flooding while allowing multiple
        // users behind the same IP to have their own limits
        const userId = req.user?.id || 'anonymous';
        const ip = req.ip || req.connection.remoteAddress;
        return `${userId}_${ip}`;
    }
});

// ============================================================
// ONBOARDING: Company Creation
// ============================================================

export const onboardLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,   // 1 hour
    max: 10,                    // 10 requests per hour
    message: {
        success: false,
        error: 'Too many company creation requests. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.ip || req.connection.remoteAddress;
    }
});

// ============================================================
// MEDIUM: Read Operations (Optional - for future use)
// ============================================================

export const readLimiter = rateLimit({
    windowMs: 60 * 1000,        // 1 minute
    max: 100,                   // 100 requests per minute
    message: {
        success: false,
        error: 'Too many requests. Please slow down.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for health checks
        return req.path === '/health';
    },
    keyGenerator: (req) => {
        const userId = req.user?.id || 'anonymous';
        const ip = req.ip || req.connection.remoteAddress;
        return `${userId}_${ip}`;
    }
});