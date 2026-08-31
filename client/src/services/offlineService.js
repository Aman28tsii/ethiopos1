// client/src/services/offlineService.js
// NEW FILE — This will be created

import API from '../api/axios';
import { 
    saveOfflineOrder, 
    getPendingOfflineOrders, 
    updateOfflineOrderStatus,
    deleteOfflineOrder
} from './offlineDB';
import { generateLocalOrderId, generateIdempotencyKey } from './orderService';

// Check if API is reachable (with timeout)
export const isApiReachable = async () => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch('/health', { 
            signal: controller.signal,
            method: 'GET'
        });
        clearTimeout(timeoutId);
        return response.ok;
    } catch (error) {
        return false;
    }
};

// Check if we're online (network + server)
export const isFullyOnline = async () => {
    if (!navigator.onLine) return false;
    return await isApiReachable();
};

// Create order (online or offline)
export const createOrder = async (orderData) => {
    const online = await isFullyOnline();
    
    if (online) {
        try {
            const response = await API.post('/orders', orderData);
            return {
                success: true,
                data: response.data.data,
                source: 'online',
                offline: false
            };
        } catch (error) {
            // If online API fails, fallback to offline
            console.warn('[OFFLINE] API failed, falling back to offline:', error.message);
            return await createOrderOffline(orderData);
        }
    } else {
        return await createOrderOffline(orderData);
    }
};

// Create order offline
const createOrderOffline = async (orderData) => {
    try {
        const localOrderId = generateLocalOrderId();
        const idempotencyKey = generateIdempotencyKey();
        
        // Get user context
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        
        const offlineOrder = {
            id: localOrderId,
            local_order_id: localOrderId,
            idempotency_key: idempotencyKey,
            company_id: user.company_id || 1,
            branch_id: user.branch_id || 1,
            user_id: user.id,
            payload: orderData,
            status: 'pending',
            created_at: new Date().toISOString(),
            attempts: 0,
            last_error: null
        };

        await saveOfflineOrder(offlineOrder);
        
        return {
            success: true,
            data: {
                local_order_id: localOrderId,
                status: 'pending',
                source: 'offline',
                order_number: `OFFLINE-${localOrderId.slice(0, 8)}`
            },
            source: 'offline',
            offline: true
        };
    } catch (error) {
        console.error('[OFFLINE] Failed to save order:', error);
        return {
            success: false,
            error: 'Failed to save order offline. Please try again.'
        };
    }
};

// Get order by ID (local or remote)
export const getOrder = async (orderId) => {
    // Check if it's a local order
    if (orderId.startsWith('offline_')) {
        // TODO: Fetch from IndexedDB
        return { success: false, error: 'Local order lookup not implemented yet' };
    }
    
    // Otherwise, fetch from server
    try {
        const response = await API.get(`/orders/${orderId}`);
        return {
            success: true,
            data: response.data.data,
            source: 'online'
        };
    } catch (error) {
        return {
            success: false,
            error: error.response?.data?.error || 'Failed to fetch order'
        };
    }
};

// Get pending offline orders for current branch
export const getPendingOfflineOrdersForBranch = async () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const allPending = await getPendingOfflineOrders();
    return allPending.filter(order => 
        order.branch_id === user.branch_id && 
        order.company_id === user.company_id
    );
};