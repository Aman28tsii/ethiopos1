// client/src/services/syncEngine.js

import API from '../api/axios';
import {
    getPendingOfflineOrders,
    updateOfflineOrderStatus,
    deleteOfflineOrder,
    getCount
} from './offlineDB';

let isSyncing = false;
let syncInterval = null;
let isInitialized = false;
let onlineHandler = null;

// ============================================
// START SYNC ENGINE
// ============================================

export const startSyncEngine = () => {
    if (isInitialized) {
        console.log('[SYNC] Engine already running');
        return;
    }

    console.log('[SYNC] Starting sync engine...');
    isInitialized = true;

    // Initial sync after startup (with delay)
    setTimeout(() => {
        if (navigator.onLine) {
            sync();
        }
    }, 3000);

    // Periodic sync every 60 seconds
    syncInterval = setInterval(() => {
        if (navigator.onLine && !isSyncing) {
            sync();
        }
    }, 60000);

    // Sync on network reconnect
    onlineHandler = () => {
        console.log('[SYNC] Network reconnected, syncing...');
        setTimeout(sync, 2000);
    };
    window.addEventListener('online', onlineHandler);

    console.log('[SYNC] Engine started');
};

// ============================================
// STOP SYNC ENGINE
// ============================================

export const stopSyncEngine = () => {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }

    if (onlineHandler) {
        window.removeEventListener('online', onlineHandler);
        onlineHandler = null;
    }

    isInitialized = false;
    isSyncing = false;
    console.log('[SYNC] Engine stopped');
};

// ============================================
// SYNC — Process All Pending Orders
// ============================================

export const sync = async () => {
    // Prevent multiple simultaneous syncs
    if (isSyncing) {
        console.log('[SYNC] Already in progress');
        return;
    }

    if (!navigator.onLine) {
        console.log('[SYNC] Offline - skipping');
        return;
    }

    isSyncing = true;
    console.log('[SYNC] Starting sync...');

    try {
        const pendingOrders = await getPendingOfflineOrders();

        if (pendingOrders.length === 0) {
            console.log('[SYNC] No pending orders');
            isSyncing = false;
            return;
        }

        console.log(`[SYNC] Found ${pendingOrders.length} pending orders`);

        let synced = 0;
        let failed = 0;

        for (const order of pendingOrders) {
            const result = await syncSingleOrder(order);
            if (result === 'synced') {
                synced++;
            } else if (result === 'failed') {
                failed++;
            }
        }

        console.log(`[SYNC] Complete: ${synced} synced, ${failed} failed`);

    } catch (error) {
        console.error('[SYNC] Error:', error);
    } finally {
        isSyncing = false;
    }
};

// ============================================
// SYNC SINGLE ORDER
// ============================================

const syncSingleOrder = async (order) => {
    try {
        // Mark as syncing
        await updateOfflineOrderStatus(order.id, 'syncing');

        console.log(`[SYNC] Processing order ${order.id}`);

        // Send to server
        const response = await API.post('/orders', order.payload, {
            headers: {
                'Idempotency-Key': order.idempotency_key
            }
        });

        if (response.data.success) {
            // Success - delete local order
            await deleteOfflineOrder(order.id);
            console.log(`[SYNC] Order ${order.id} synced successfully`);
            return 'synced';
        }

        // Server returned error
        const errorMsg = response.data.error || 'Unknown server error';
        await updateOfflineOrderStatus(order.id, 'failed', errorMsg);
        console.error(`[SYNC] Order ${order.id} failed:`, errorMsg);
        return 'failed';

    } catch (error) {
        const status = error.response?.status;
        const errorMsg = error.response?.data?.error || error.message;

        // Handle specific error cases
        if (status === 401 || status === 403) {
            // Authentication/authorization failure - don't retry
            await updateOfflineOrderStatus(order.id, 'failed', `Auth error: ${errorMsg}`);
            console.error(`[SYNC] Order ${order.id} auth failed:`, errorMsg);
            return 'failed';
        }

        if (status === 409) {
            // Duplicate - already processed
            await deleteOfflineOrder(order.id);
            console.log(`[SYNC] Order ${order.id} already exists (duplicate)`);
            return 'synced';
        }

        // Retry logic
        const attempts = (order.attempts || 0) + 1;
        if (attempts >= 5) {
            await updateOfflineOrderStatus(order.id, 'failed', `Max retries exceeded: ${errorMsg}`);
            console.error(`[SYNC] Order ${order.id} failed permanently (${attempts} attempts)`);
            return 'failed';
        }

        // Keep for retry
        await updateOfflineOrderStatus(order.id, 'pending', errorMsg);
        console.log(`[SYNC] Order ${order.id} will retry (attempt ${attempts}/5)`);
        return 'pending';
    }
};

// ============================================
// GET SYNC STATUS
// ============================================

export const getSyncStatus = async () => {
    try {
        const total = await getCount('offline_orders');
        const pending = await getPendingOfflineOrders();
        return {
            total: total || 0,
            pending: pending?.length || 0,
            isSyncing,
            hasPending: (total || 0) > 0
        };
    } catch (error) {
        console.error('[SYNC] Status error:', error);
        return { total: 0, pending: 0, isSyncing: false, hasPending: false };
    }
};

// ============================================
// MANUAL SYNC TRIGGER
// ============================================

export const triggerSync = async () => {
    if (!navigator.onLine) {
        console.log('[SYNC] Cannot sync while offline');
        return { success: false, message: 'Offline' };
    }

    if (isSyncing) {
        console.log('[SYNC] Already syncing');
        return { success: false, message: 'Already syncing' };
    }

    await sync();
    return { success: true, message: 'Sync completed' };
};