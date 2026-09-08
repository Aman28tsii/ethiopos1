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
        const forwarded = req.headers['x-forwarded-for'];
        return forwarded ? forwarded.split(',')[0].trim() : req.ip || req.connection.remoteAddress;
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
        // Use x-forwarded-for for proxy environments (Render, etc.)
        const forwarded = req.headers['x-forwarded-for'];
        const clientIp = forwarded ? forwarded.split(',')[0].trim() : req.ip || req.connection.remoteAddress;
        const userId = req.user?.id || 'anonymous';
        return `${userId}_${clientIp}`;
    },
    // Skip rate limiting for health checks
    skip: (req) => {
        return req.path === '/health' || req.path === '/';
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
        const forwarded = req.headers['x-forwarded-for'];
        return forwarded ? forwarded.split(',')[0].trim() : req.ip || req.connection.remoteAddress;
    }
});

// ============================================================
// MEDIUM: Read Operations
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
        return req.path === '/health' || req.path === '/';
    },
    keyGenerator: (req) => {
        const forwarded = req.headers['x-forwarded-for'];
        const clientIp = forwarded ? forwarded.split(',')[0].trim() : req.ip || req.connection.remoteAddress;
        const userId = req.user?.id || 'anonymous';
        return `${userId}_${clientIp}`;
    }
});