// client/src/hooks/useCachedFetch.js

import { useState, useEffect, useCallback, useRef } from 'react';
import API from '../api/axios';
import { saveProducts, getProducts as getOfflineProducts } from '../services/offlineDB';
import { saveCategories, getCategories as getOfflineCategories } from '../services/offlineDB';
import { saveTables, getTables as getOfflineTables } from '../services/offlineDB';

// In-memory cache
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

// Check if offline
const isOffline = () => {
    return !navigator.onLine;
};

export function useCachedFetch(baseKey, fetchFn, ttl = 60000, dependencies = []) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [fromCache, setFromCache] = useState(false);
    const isMounted = useRef(true);
    const keyRef = useRef(getCacheKey(baseKey));

    const getCurrentKey = useCallback(() => {
        const newKey = getCacheKey(baseKey);
        if (keyRef.current !== newKey) {
            console.log(`[CACHE KEY CHANGED] ${keyRef.current} → ${newKey}`);
            keyRef.current = newKey;
        }
        return keyRef.current;
    }, [baseKey]);

    // Save data to IndexedDB based on resource type
    const saveToIndexedDB = useCallback(async (key, responseData) => {
        try {
            const context = getUserContext();
            
            if (key === 'products' && responseData?.data) {
                await saveProducts(responseData.data, context.branch_id, context.company_id);
                console.log(`[INDEXEDDB] Products saved for branch ${context.branch_id}`);
            } else if (key === 'categories' && responseData?.data) {
                await saveCategories(responseData.data, context.company_id);
                console.log(`[INDEXEDDB] Categories saved for company ${context.company_id}`);
            } else if (key === 'tables' && responseData?.data) {
                await saveTables(responseData.data, context.branch_id);
                console.log(`[INDEXEDDB] Tables saved for branch ${context.branch_id}`);
            }
        } catch (err) {
            console.warn('[INDEXEDDB] Failed to save:', err);
        }
    }, []);

    // Load data from IndexedDB
    const loadFromIndexedDB = useCallback(async (key) => {
        try {
            const context = getUserContext();
            let result = null;

            if (key === 'products') {
                result = await getOfflineProducts(context.branch_id);
                if (result && result.length > 0) {
                    console.log(`[INDEXEDDB] Products loaded: ${result.length} items`);
                    return { data: result, source: 'offline' };
                }
            } else if (key === 'categories') {
                result = await getOfflineCategories(context.company_id);
                if (result && result.length > 0) {
                    console.log(`[INDEXEDDB] Categories loaded: ${result.length} items`);
                    return { data: result, source: 'offline' };
                }
            } else if (key === 'tables') {
                result = await getOfflineTables(context.branch_id);
                if (result && result.length > 0) {
                    console.log(`[INDEXEDDB] Tables loaded: ${result.length} items`);
                    return { data: result, source: 'offline' };
                }
            }
            return null;
        } catch (err) {
            console.warn('[INDEXEDDB] Failed to load:', err);
            return null;
        }
    }, []);

    const fetchData = useCallback(async () => {
        const key = getCurrentKey();
        const isOfflineMode = isOffline();
        
        // Check in-memory cache
        const cached = cache.get(key);
        if (cached && Date.now() - cached.timestamp < ttl) {
            console.log(`[CACHE HIT] ${key}`);
            if (isMounted.current) {
                setData(cached.data);
                setLoading(false);
                setFromCache(true);
            }
            return;
        }

        // Check if offline - try IndexedDB
        if (isOfflineMode) {
            console.log(`[OFFLINE] Loading ${key} from IndexedDB`);
            const offlineData = await loadFromIndexedDB(baseKey);
            if (offlineData && isMounted.current) {
                setData(offlineData.data);
                setLoading(false);
                setFromCache(true);
                return;
            }
            // No offline data available
            if (isMounted.current) {
                setData([]);
                setLoading(false);
                setError(new Error('Offline - No cached data available'));
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
                    setFromCache(false);
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
                // Store in memory cache
                cache.set(key, { data: result, timestamp: Date.now() });
                pendingRequests.delete(key);
                
                // Save to IndexedDB for offline use
                saveToIndexedDB(baseKey, result);
                
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
                setFromCache(false);
            }
        } catch (err) {
            if (isMounted.current) {
                // Try IndexedDB as fallback
                const offlineData = await loadFromIndexedDB(baseKey);
                if (offlineData) {
                    console.log(`[FALLBACK] Using IndexedDB for ${baseKey}`);
                    setData(offlineData.data);
                    setFromCache(true);
                    setError(null);
                } else {
                    setError(err);
                }
                setLoading(false);
            }
            console.error(`Cache fetch error for ${key}:`, err);
        } finally {
            if (isMounted.current) {
                setLoading(false);
            }
        }
    }, [baseKey, fetchFn, ttl, getCurrentKey, loadFromIndexedDB, saveToIndexedDB]);

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

    return { 
        data, 
        loading, 
        error, 
        fromCache,
        refetch, 
        invalidateCache, 
        clearUserCache
    };
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