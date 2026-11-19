// client/src/services/orderService.js

import API from '../api/axios';
import { 
    saveOfflineOrder, 
    getPendingOfflineOrders, 
    updateOfflineOrderStatus,
    deleteOfflineOrder,
    getOfflineOrder
} from './offlineDB';

// ============================================================
// NETWORK STATUS
// ============================================================

export const isOnline = () => {
    return navigator.onLine;
};

/**
 * Check if the API is reachable
 * @returns {Promise<boolean>} True if API is reachable
 */
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

/**
 * Check if we're fully online (network + server)
 * @returns {Promise<boolean>} True if fully online
 */
export const isFullyOnline = async () => {
    if (!isOnline()) return false;
    return await isApiReachable();
};

// ============================================================
// ID GENERATORS
// ============================================================

export const generateLocalOrderId = () => {
    return 'offline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

export const generateClientOrderId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
};

// ============================================================
// IDEMPOTENCY KEY MANAGEMENT
// ============================================================

const usedIdempotencyKeys = new Map();

export const generateIdempotencyKey = (payload) => {
    const payloadHash = JSON.stringify(payload);
    const existing = Array.from(usedIdempotencyKeys.entries()).find(
        ([, value]) => value.payloadHash === payloadHash
    );
    
    if (existing) {
        return existing[0];
    }
    
    const key = 'idem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    usedIdempotencyKeys.set(key, {
        payloadHash,
        timestamp: Date.now()
    });
    return key;
};

export const cleanupIdempotencyKeys = () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [key, value] of usedIdempotencyKeys) {
        if (value.timestamp < oneHourAgo) {
            usedIdempotencyKeys.delete(key);
        }
    }
};

setInterval(cleanupIdempotencyKeys, 60 * 60 * 1000);

// ============================================================
// ORDER CREATION (ONLINE + OFFLINE)
// ============================================================

/**
 * Create an order (handles both online and offline)
 * @param {Object} orderData - The order data
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Order creation result
 */
export const createOrder = async (orderData, options = {}) => {
    const { forceOffline = false, retryCount = 0, clientOrderId = null } = options;
    const effectiveClientOrderId = clientOrderId || generateClientOrderId();
    const online = await isFullyOnline();
    
    // If online and not forced offline, try server first
    if (online && !forceOffline) {
        try {
            const result = await createOrderOnline(orderData, effectiveClientOrderId);
            return {
                success: true,
                data: result.data,
                source: 'online',
                offline: false
            };
        } catch (error) {
            console.warn('[ORDER] Online order failed:', error.message);
            
            // If this is a retry and it's a duplicate, return the cached result
            if (error.response?.status === 409) {
                console.log('[ORDER] Duplicate detected, using cached result');
                return {
                    success: true,
                    data: error.response?.data?.existing_order || error.response?.data?.data || { order_number: 'DUPLICATE' },
                    source: 'online',
                    offline: false,
                    duplicate: true
                };
            }
            
            // If API fails while online, fallback to offline
            if (retryCount < 3) {
                console.log(`[ORDER] Retrying online (${retryCount + 1}/3)...`);
                return await createOrder(orderData, {
                    ...options,
                    retryCount: retryCount + 1,
                    clientOrderId: effectiveClientOrderId
                });
            }
            
            // After retries, fallback to offline
            console.log('[ORDER] Online failed after retries, saving offline');
            return await createOrderOffline(orderData, effectiveClientOrderId);
        }
    }
    
    // If offline or forced offline, save locally
    return await createOrderOffline(orderData, effectiveClientOrderId);
};

// ============================================================
// ONLINE ORDER CREATION
// ============================================================

/**
 * Create an order on the server
 * @param {Object} orderData - The order data
 * @param {string|null} clientOrderId - Stable UUID for this logical order
 * @returns {Promise<Object>} Server response
 */
export const createOrderOnline = async (orderData, clientOrderId = null) => {
    // Generate idempotency key for this order
    const idempotencyKey = generateIdempotencyKey(orderData);
    
    console.log(`[ORDER] Creating order online with key: ${idempotencyKey}`);
    
    try {
        const headers = { 'Idempotency-Key': idempotencyKey };
        if (clientOrderId) headers['X-Client-Order-Id'] = clientOrderId;
        const response = await API.post('/orders', orderData, { headers });
        
        if (response.data.success) {
            console.log(`[ORDER] Order created online: ${response.data.data?.order_number}`);
        }
        
        return response.data;
    } catch (error) {
        // If it's a duplicate (409), return the cached result
        if (error.response?.status === 409) {
            console.log('[ORDER] Duplicate order detected, returning cached result');
            return error.response.data;
        }
        throw error;
    }
};

// ============================================================
// OFFLINE ORDER CREATION
// ============================================================

/**
 * Create an order offline (saved to IndexedDB)
 * @param {Object} orderData - The order data
 * @param {string|null} clientOrderId - Stable UUID for this logical order
 * @returns {Promise<Object>} Offline order result
 */
export const createOrderOffline = async (orderData, clientOrderId = null) => {
    try {
        const localOrderId = generateLocalOrderId();
        const idempotencyKey = generateIdempotencyKey(orderData);
        const effectiveClientOrderId = clientOrderId || generateClientOrderId();
        
        // Get user context
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const branchId = localStorage.getItem('ethiopos_selected_branch') || user.branch_id || 1;
        
        const offlineOrder = {
            id: localOrderId,
            local_order_id: localOrderId,
            idempotency_key: idempotencyKey,
            client_order_id: effectiveClientOrderId,
            company_id: user.company_id || 1,
            branch_id: parseInt(branchId),
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
                order_number: `OFFLINE-${localOrderId.slice(0, 8)}`,
                offline: true
            },
            source: 'offline',
            offline: true
        };
    } catch (error) {
        console.error('[ORDER] Failed to save offline order:', error);
        return {
            success: false,
            error: 'Failed to save order offline. Please try again.',
            offline: true
        };
    }
};

// ============================================================
// ADD ITEMS TO EXISTING ORDER
// ============================================================

/**
 * Add items to an existing order
 * @param {number} orderId - The order ID
 * @param {Array} items - Items to add
 * @returns {Promise<Object>} Result
 */
export const addItemsToOrder = async (orderId, items) => {
    const online = await isFullyOnline();
    
    if (online) {
        try {
            const response = await API.post(`/orders/${orderId}/add-items`, { items });
            return {
                success: true,
                data: response.data,
                source: 'online'
            };
        } catch (error) {
            console.error('[ORDER] Failed to add items online:', error);
            throw error;
        }
    } else {
        // Offline - store in IndexedDB
        try {
            // Store the add-items operation in the sync queue
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const branchId = localStorage.getItem('ethiopos_selected_branch') || user.branch_id || 1;
            
            const offlineOperation = {
                id: `add_items_${Date.now()}_${uuidv4().slice(0, 8)}`,
                operation: 'add_items',
                order_id: orderId,
                items: items,
                company_id: user.company_id || 1,
                branch_id: parseInt(branchId),
                user_id: user.id,
                status: 'pending',
                created_at: new Date().toISOString()
            };
            
            // Save to offline DB
            await saveOfflineOrder(offlineOperation);
            
            return {
                success: true,
                data: {
                    offline: true,
                    message: 'Items will be added when online'
                },
                source: 'offline',
                offline: true
            };
        } catch (error) {
            console.error('[ORDER] Failed to save add-items offline:', error);
            return {
                success: false,
                error: 'Failed to save items offline',
                offline: true
            };
        }
    }
};

// ============================================================
// GET ORDER (LOCAL OR REMOTE)
// ============================================================

/**
 * Get an order by ID (checks local first, then remote)
 * @param {string} orderId - The order ID
 * @returns {Promise<Object>} Order data
 */
export const getOrder = async (orderId) => {
    // Check if it's a local order ID
    if (orderId.startsWith('offline_')) {
        try {
            const offlineOrder = await getOfflineOrder(orderId);
            if (offlineOrder) {
                return {
                    success: true,
                    data: {
                        order_number: `OFFLINE-${orderId.slice(0, 8)}`,
                        status: offlineOrder.status || 'pending',
                        source: 'offline',
                        local_order_id: orderId,
                        total_amount: offlineOrder.payload?.total_amount || 0,
                        items: offlineOrder.payload?.items || []
                    },
                    source: 'offline'
                };
            }
        } catch (error) {
            console.error('[ORDER] Failed to get offline order:', error);
        }
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
// GET ORDER STATUS
// ============================================================

/**
 * Get order status (local or remote)
 * @param {string} orderId - The order ID
 * @returns {Promise<Object>} Order status
 */
export const getOrderStatus = async (orderId) => {
    // Check if it's a local order ID
    if (orderId.startsWith('offline_')) {
        try {
            const offlineOrder = await getOfflineOrder(orderId);
            if (offlineOrder) {
                return {
                    status: offlineOrder.status || 'pending',
                    source: 'offline',
                    data: offlineOrder
                };
            }
        } catch (error) {
            console.error('[ORDER] Failed to get offline order status:', error);
        }
        return { status: 'pending', source: 'offline' };
    }
    
    // Otherwise, check with API
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

// ============================================================
// GET PENDING OFFLINE ORDERS
// ============================================================

/**
 * Get all pending offline orders for the current branch
 * @returns {Promise<Array>} List of pending orders
 */
export const getPendingOfflineOrdersList = async () => {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const branchId = localStorage.getItem('ethiopos_selected_branch') || user.branch_id || 1;
        const allPending = await getPendingOfflineOrders();
        
        // Filter by current user's company and branch
        return allPending.filter(order => 
            order.company_id === (user.company_id || 1) && 
            order.branch_id === parseInt(branchId)
        );
    } catch (error) {
        console.error('[ORDER] Failed to get pending orders:', error);
        return [];
    }
};

// ============================================================
// CANCEL ORDER
// ============================================================

/**
 * Cancel an order (local or remote)
 * @param {string} orderId - The order ID
 * @param {string} reason - Cancellation reason
 * @returns {Promise<Object>} Result
 */
export const cancelOrder = async (orderId, reason = '') => {
    const online = await isFullyOnline();
    
    // Check if it's a local order
    if (orderId.startsWith('offline_')) {
        try {
            const offlineOrder = await getOfflineOrder(orderId);
            if (offlineOrder) {
                await updateOfflineOrderStatus(orderId, 'cancelled', reason);
                return {
                    success: true,
                    message: 'Order cancelled locally',
                    offline: true
                };
            }
        } catch (error) {
            console.error('[ORDER] Failed to cancel offline order:', error);
        }
        return {
            success: false,
            error: 'Failed to cancel offline order'
        };
    }
    
    // Otherwise, cancel on server
    if (online) {
        try {
            const response = await API.put(`/orders/${orderId}/cancel`, { reason });
            return {
                success: true,
                data: response.data,
                source: 'online'
            };
        } catch (error) {
            console.error('[ORDER] Failed to cancel order:', error);
            throw error;
        }
    } else {
        return {
            success: false,
            error: 'Cannot cancel order while offline. Please try again when online.',
            offline: true
        };
    }
};

// ============================================================
// SYNC QUEUE MANAGEMENT
// ============================================================

/**
 * Queue an order for sync (used by sync engine)
 * @param {Object} order - The order to sync
 * @returns {Promise<Object>} Sync result
 */
export const queueForSync = async (order) => {
    try {
        // Save the order to the sync queue if not already saved
        if (!order.id || !order.local_order_id) {
            const newOrder = {
                ...order,
                id: generateLocalOrderId(),
                local_order_id: order.local_order_id || generateLocalOrderId(),
                status: 'pending',
                created_at: new Date().toISOString(),
                attempts: 0
            };
            await saveOfflineOrder(newOrder);
            return {
                success: true,
                data: newOrder
            };
        }
        return {
            success: true,
            data: order
        };
    } catch (error) {
        console.error('[ORDER] Failed to queue for sync:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

// ============================================================
// EXPORT ALL FUNCTIONS
// ============================================================

export default {
    createOrder,
    createOrderOnline,
    createOrderOffline,
    addItemsToOrder,
    getOrder,
    getOrderStatus,
    getPendingOfflineOrdersList,
    cancelOrder,
    generateIdempotencyKey,
    generateLocalOrderId,
    generateClientOrderId,
    isOnline,
    isApiReachable,
    isFullyOnline,
    queueForSync,
    cleanupIdempotencyKeys
};