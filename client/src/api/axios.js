// client/src/api/axios.js

import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'https://ethiopos-backend.onrender.com/api';

const API = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

console.log('API Base URL:', API_URL);

// ✅ FIX: Prevent redirect loops
let isRedirecting = false;

// Request interceptor - add token and branch for owner
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // For owner/admin, add branchId to params if available
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const isOwner = user.role === 'owner' || user.role === 'admin';
      
      if (isOwner) {
        const selectedBranch = localStorage.getItem('ethiopos_selected_branch');
        if (selectedBranch) {
          // Only add branchId for endpoints that support it
          const branchEndpoints = [
            '/dashboard',
            '/dashboard/charts',
            '/tables/owner',
            '/sales',
            '/sales/today',
            '/profit/report',
            '/profit/today',
            '/profit/trend',
            '/expenses',
            '/expenses/summary',
            '/orders/ready',
            '/orders/my-orders',
            '/orders/pending-confirmation',
            '/kitchen/orders',
            '/kitchen/completed',
            '/ingredients',
            '/ingredients/low-stock',
            '/recipes/wastage-report',
            '/recipes/ingredients',
            '/auth/me'
          ];
          
          const shouldAddBranch = branchEndpoints.some(endpoint => 
            config.url?.includes(endpoint) || config.url?.startsWith(endpoint)
          );
          
          if (shouldAddBranch && !config.params) {
            config.params = {};
          }
          if (shouldAddBranch) {
            config.params.branchId = parseInt(selectedBranch);
          }
        }
      }
    } catch (e) {
      // Silent fail - user not logged in or not owner
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

// RETRY LOGIC - MAX 3 retries on network errors
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// Response interceptor with retry logic
API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response, code } = error;
    
    if (!config || config._retryCount === undefined) {
      if (config) config._retryCount = 0;
    }

    const shouldRetry = (
      (code === 'ECONNABORTED' || code === 'ERR_NETWORK' || !response) ||
      (response && response.status >= 500)
    ) && config._retryCount < MAX_RETRIES;

    if (shouldRetry) {
      config._retryCount += 1;
      console.log(`Retrying request (${config._retryCount}/${MAX_RETRIES})...`);
      
      const delay = RETRY_DELAY * Math.pow(2, config._retryCount - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return API(config);
    }
    
    // ✅ FIX: Prevent redirect loops
    if (error.response?.status === 401) {
      const isPublicRoute = error.config?.url?.includes('/qr-order') || 
                           error.config?.url?.includes('/track') ||
                           error.config?.url?.includes('/products');
      
      if (!isPublicRoute && !isRedirecting) {
        isRedirecting = true;
        
        // Clear auth data
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('ethiopos_selected_branch');
        
        // Use React Router navigation if available, otherwise fallback to window.location
        try {
          // Check if we're in a React Router context
          const navigate = window.__reactRouterNavigate;
          if (navigate) {
            navigate('/login');
          } else {
            window.location.href = '/login';
          }
        } catch (e) {
          window.location.href = '/login';
        }
        
        // Reset redirect flag after a delay
        setTimeout(() => {
          isRedirecting = false;
        }, 1000);
      }
    }
    
    console.error('API Error:', error.message);
    return Promise.reject(error);
  }
);

export default API;