// client/src/services/orderService.js

import API from '../api/axios';
import { saveOfflineOrder, getPendingOfflineOrders, updateOfflineOrderStatus } from './offlineDB';
import { v4 as uuidv4 } from 'uuid';

// Generate unique local order ID
export const generateLocalOrderId = () => {
    return `offline_${Date.now()}_${uuidv4().slice(0, 8)}`;
};

// Generate idempotency key
export const generateIdempotencyKey = () => {
    return `idem_${Date.now()}_${uuidv4()}`;
};

// Check if online
export const isOnline = () => {
    return navigator.onLine;
};

// Create order (handles both online and offline)
export const createOrder = async (orderData) => {
    const online = isOnline();

    // If online, use existing API
    if (online) {
        try {
            const response = await API.post('/orders', orderData);
            if (response.data.success) {
                return {
                    success: true,
                    data: response.data.data,
                    source: 'online',
                    order_number: response.data.data.order_number
                };
            }
            throw new Error(response.data.error || 'Order creation failed');
        } catch (error) {
            // If API fails while online, fallback to offline
            console.warn('[ORDER] Online order failed, saving offline:', error.message);
            return await saveOfflineOrderData(orderData);
        }
    }

    // If offline, save locally
    return await saveOfflineOrderData(orderData);
};

// Save order offline
export const saveOfflineOrderData = async (orderData) => {
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
        
        console.log(`[ORDER] Offline order saved: ${localOrderId}`);
        
        return {
            success: true,
            data: {
                local_order_id: localOrderId,
                status: 'pending',
                source: 'offline',
                order_number: `OFFLINE-${localOrderId.slice(0, 8)}`
            },
            source: 'offline'
        };
    } catch (error) {
        console.error('[ORDER] Failed to save offline order:', error);
        return {
            success: false,
            error: 'Failed to save order offline. Please try again.'
        };
    }
};

// Get pending offline orders
export const getPendingOfflineOrdersList = async () => {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const allPending = await getPendingOfflineOrders();
        // Filter by current user's company and branch
        return allPending.filter(order => 
            order.company_id === user.company_id && 
            order.branch_id === user.branch_id
        );
    } catch (error) {
        console.error('[ORDER] Failed to get pending orders:', error);
        return [];
    }
};

// Get order status (local or remote)
export const getOrderStatus = async (orderId) => {
    // Check if it's a local order ID
    if (orderId.startsWith('offline_')) {
        // Could check local DB for status
        return { status: 'pending', source: 'offline' };
    }
    
    // If it's a server order ID, check with API
    try {
        const response = await API.get(`/orders/track/${orderId}`);
        if (response.data.success) {
            return {
                status: response.data.data.status,
                source: 'online',
                data: response.data.data
            };
        }
        return { status: 'unknown', error: 'Order not found' };
    } catch (error) {
        console.error('[ORDER] Failed to get order status:', error);
        return { status: 'unknown', error: error.message };
    }
};