// client/src/hooks/useCachedFetch.js

import { useState, useEffect, useCallback, useRef } from 'react';
import API from '../api/axios';

// Simple in-memory cache
const cache = new Map();
const pendingRequests = new Map();

export function useCachedFetch(key, fetchFn, ttl = 60000, dependencies = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isMounted = useRef(true);

  const fetchData = useCallback(async () => {
    // Check cache
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      if (isMounted.current) {
        setData(cached.data);
        setLoading(false);
      }
      return;
    }

    // Check if request is already in progress
    if (pendingRequests.has(key)) {
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
  }, [key, fetchFn, ttl]);

  useEffect(() => {
    isMounted.current = true;
    fetchData();
    
    return () => {
      isMounted.current = false;
    };
  }, [fetchData, ...dependencies]);

  const refetch = useCallback(() => {
    cache.delete(key);
    fetchData();
  }, [key, fetchData]);

  return { data, loading, error, refetch };
}

// Pre-defined hooks for common data
export function useProducts() {
  return useCachedFetch('products', () => 
    API.get('/products').then(res => res.data.data || []), 
    30000 // 30 seconds cache
  );
}

export function useCategories() {
  return useCachedFetch('categories', () => 
    API.get('/categories').then(res => res.data.data || []), 
    60000 // 60 seconds cache
  );
}

export function useTables() {
  return useCachedFetch('tables', () => 
    API.get('/tables').then(res => res.data.data || []), 
    15000 // 15 seconds cache
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
    60000, // 60 seconds cache
    [period]
  );
}