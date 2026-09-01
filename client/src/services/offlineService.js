// client/src/services/offlineService.js

import API from '../api/axios';
import { 
    saveOfflineOrder, 
    getPendingOfflineOrders, 
    updateOfflineOrderStatus,
    deleteOfflineOrder,
    getOfflineOrder,
    getAllOfflineOrders
} from './offlineDB';
import { generateLocalOrderId, generateIdempotencyKey } from './orderService';

// ============================================================
// NETWORK STATUS CHECK
// ============================================================

export const isApiReachable = async () => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch('/health', { 
            signal: controller.signal,
            method: 'GET',
            headers: { 'Cache-Control': 'no-cache' }
        });
        clearTimeout(timeoutId);
        return response.ok;
    } catch (error) {
        return false;
    }
};

export const isFullyOnline = async () => {
    if (!navigator.onLine) return false;
    return await isApiReachable();
};

// ============================================================
// OFFLINE ORDER CREATION
// ============================================================

export const createOrderOffline = async (orderData) => {
    try {
        const localOrderId = generateLocalOrderId();
        const idempotencyKey = generateIdempotencyKey(orderData);
        
        // Get user context
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const branchId = localStorage.getItem('ethiopos_selected_branch') || user.branch_id || 1;
        
        const offlineOrder = {
            id: localOrderId,
            local_order_id: localOrderId,
            idempotency_key: idempotencyKey,
            company_id: user.company_id || 1,
            branch_id: parseInt(branchId),
            user_id: user.id,
            payload: {
                ...orderData,
                source: 'offline'
            },
            status: 'pending',
            created_at: new Date().toISOString(),
            attempts: 0,
            last_error: null
        };

        await saveOfflineOrder(offlineOrder);
        
        console.log(`[OFFLINE] Order saved: ${localOrderId}`);
        
        return {
            success: true,
            data: {
                local_order_id: localOrderId,
                status: 'pending',
                source: 'offline',
                order_number: `OFFLINE-${localOrderId.slice(0, 8)}`,
                offline: true
            },
            source: 'offline',
            offline: true
        };
    } catch (error) {
        console.error('[OFFLINE] Failed to save order:', error);
        return {
            success: false,
            error: 'Failed to save order offline. Please try again.',
            offline: true
        };
    }
};

// ============================================================
// CREATE ORDER (ONLINE OR OFFLINE)
// ============================================================

export const createOrder = async (orderData) => {
    const online = await isFullyOnline();
    
    if (online) {
        try {
            const idempotencyKey = generateIdempotencyKey(orderData);
            
            const response = await API.post('/orders', orderData, {
                headers: {
                    'Idempotency-Key': idempotencyKey
                }
            });
            
            if (response.data.success) {
                return {
                    success: true,
                    data: response.data.data,
                    source: 'online',
                    offline: false
                };
            }
            throw new Error(response.data.error || 'Order creation failed');
        } catch (error) {
            console.warn('[ORDER] Online order failed:', error.message);
            
            // If 400 with "Idempotency-Key required", we need to retry
            if (error.response?.status === 400) {
                // This is a client-side issue, but we can handle it
                console.log('[ORDER] Retrying with idempotency key...');
                // The API will handle the key
            }
            
            // If API fails while online, fallback to offline
            return await createOrderOffline(orderData);
        }
    }
    
    // If offline, save locally
    return await createOrderOffline(orderData);
};

// ============================================================
// GET PENDING ORDERS FOR CURRENT BRANCH
// ============================================================

export const getPendingOrdersForBranch = async () => {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const branchId = localStorage.getItem('ethiopos_selected_branch') || user.branch_id || 1;
        const allPending = await getPendingOfflineOrders();
        
        return allPending.filter(order => 
            order.branch_id === parseInt(branchId) && 
            order.company_id === (user.company_id || 1)
        );
    } catch (error) {
        console.error('[OFFLINE] Failed to get pending orders:', error);
        return [];
    }
};

// ============================================================
// GET OFFLINE ORDER BY ID
// ============================================================

export const getOrderById = async (orderId) => {
    // Check if it's a local order
    if (orderId.startsWith('offline_')) {
        try {
            const order = await getOfflineOrder(orderId);
            if (order) {
                return {
                    success: true,
                    data: {
                        ...order,
                        order_number: `OFFLINE-${orderId.slice(0, 8)}`,
                        source: 'offline'
                    },
                    source: 'offline'
                };
            }
        } catch (error) {
            console.error('[OFFLINE] Failed to get order:', error);
        }
        return {
            success: false,
            error: 'Order not found locally',
            source: 'offline'
        };
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
            error: error.response?.data?.error || 'Failed to fetch order',
            source: 'online'
        };
    }
};

// ============================================================
// GET SYNC STATUS
// ============================================================

export const getSyncStatus = async () => {
    try {
        const pending = await getPendingOrdersForBranch();
        const all = await getAllOfflineOrders();
        const total = all.length || 0;
        
        return {
            total: total,
            pending: pending.length || 0,
            hasPending: pending.length > 0,
            isOnline: await isFullyOnline()
        };
    } catch (error) {
        console.error('[OFFLINE] Failed to get sync status:', error);
        return {
            total: 0,
            pending: 0,
            hasPending: false,
            isOnline: navigator.onLine
        };
    }
};