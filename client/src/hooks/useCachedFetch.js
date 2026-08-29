// client/src/hooks/useCachedFetch.js

import { useState, useEffect, useCallback, useRef } from 'react';
import API from '../api/axios';

// Simple in-memory cache
const cache = new Map();
const pendingRequests = new Map();

// Helper to get current user context
const getUserContext = () => {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        return {
            company_id: user.company_id || 'unknown',
            branch_id: user.branch_id || 'unknown',
            role: user.role || 'unknown'
        };
    } catch (e) {
        return { company_id: 'unknown', branch_id: 'unknown', role: 'unknown' };
    }
};

// Generate cache key with tenant isolation
const getCacheKey = (baseKey) => {
    const context = getUserContext();
    return `${baseKey}_company_${context.company_id}_branch_${context.branch_id}`;
};

export function useCachedFetch(baseKey, fetchFn, ttl = 60000, dependencies = []) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const isMounted = useRef(true);
    const keyRef = useRef(getCacheKey(baseKey));

    // Regenerate key when context changes
    const getCurrentKey = useCallback(() => {
        const newKey = getCacheKey(baseKey);
        if (keyRef.current !== newKey) {
            console.log(`[CACHE KEY CHANGED] ${keyRef.current} → ${newKey}`);
            keyRef.current = newKey;
        }
        return keyRef.current;
    }, [baseKey]);

    const fetchData = useCallback(async () => {
        const key = getCurrentKey();
        
        // Check cache with tenant-isolated key
        const cached = cache.get(key);
        if (cached && Date.now() - cached.timestamp < ttl) {
            console.log(`[CACHE HIT] ${key}`);
            if (isMounted.current) {
                setData(cached.data);
                setLoading(false);
            }
            return;
        }

        // Check if request is already in progress
        if (pendingRequests.has(key)) {
            console.log(`[CACHE DEDUPE] ${key}`);
            try {
                const result = await pendingRequests.get(key);
                if (isMounted.current) {
                    setData(result);
                    setLoading(false);
                }
            } catch (err) {
                if (isMounted.current) {
                    setError(err);
                    setLoading(false);
                }
            }
            return;
        }

        // Make new request
        console.log(`[CACHE MISS] ${key}`);
        setLoading(true);
        const promise = fetchFn()
            .then(result => {
                cache.set(key, { data: result, timestamp: Date.now() });
                pendingRequests.delete(key);
                return result;
            })
            .catch(err => {
                pendingRequests.delete(key);
                throw err;
            });

        pendingRequests.set(key, promise);

        try {
            const result = await promise;
            if (isMounted.current) {
                setData(result);
                setError(null);
            }
        } catch (err) {
            if (isMounted.current) {
                setError(err);
            }
            console.error(`Cache fetch error for ${key}:`, err);
        } finally {
            if (isMounted.current) {
                setLoading(false);
            }
        }
    }, [baseKey, fetchFn, ttl, getCurrentKey]);

    useEffect(() => {
        isMounted.current = true;
        fetchData();
        
        return () => {
            isMounted.current = false;
        };
    }, [fetchData, ...dependencies]);

    const refetch = useCallback(() => {
        const key = getCurrentKey();
        console.log(`[CACHE INVALIDATE] ${key}`);
        cache.delete(key);
        fetchData();
    }, [getCurrentKey, fetchData]);

    const invalidateCache = useCallback(() => {
        const key = getCurrentKey();
        console.log(`[CACHE CLEAR] ${key}`);
        cache.delete(key);
    }, [getCurrentKey]);

    // Clear all cache for current user
    const clearUserCache = useCallback(() => {
        const context = getUserContext();
        const prefix = `_company_${context.company_id}_branch_${context.branch_id}`;
        let count = 0;
        for (const [cacheKey] of cache) {
            if (cacheKey.includes(prefix)) {
                cache.delete(cacheKey);
                count++;
            }
        }
        console.log(`[CACHE CLEAR] Removed ${count} entries for current user`);
    }, []);

    return { data, loading, error, refetch, invalidateCache, clearUserCache };
}

// Pre-defined hooks with tenant-isolated keys
export function useProducts() {
    return useCachedFetch('products', () => 
        API.get('/products').then(res => res.data.data || []), 
        30000
    );
}

export function useCategories() {
    return useCachedFetch('categories', () => 
        API.get('/categories').then(res => res.data.data || []), 
        60000
    );
}

export function useTables() {
    return useCachedFetch('tables', () => 
        API.get('/tables').then(res => res.data.data || []), 
        15000
    );
}

export function useDashboardData(period = 'week') {
    return useCachedFetch(`dashboard_${period}`, () => 
        Promise.all([
            API.get('/dashboard'),
            API.get('/dashboard/charts', { params: { period } })
        ]).then(([dashboardRes, chartsRes]) => ({
            dashboard: dashboardRes.data.data,
            charts: chartsRes.data.data
        })),
        60000,
        [period]
    );
}