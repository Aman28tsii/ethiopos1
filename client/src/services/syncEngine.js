// client/src/services/syncEngine.js

import API from '../api/axios';
import {
    getPendingOfflineOrders,
    updateOfflineOrderStatus,
    deleteOfflineOrder,
    getCount
} from './offlineDB';
import { isFullyOnline } from './offlineService';

let isSyncing = false;
let syncInterval = null;
let isInitialized = false;
let onlineHandler = null;

// Get current user context
const getUserContext = () => {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const branchId = localStorage.getItem('ethiopos_selected_branch') || user.branch_id || 1;
        return {
            company_id: user.company_id || 1,
            branch_id: parseInt(branchId),
            user_id: user.id
        };
    } catch (e) {
        return { company_id: 1, branch_id: 1, user_id: null };
    }
};

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

    // Initial sync after startup (delayed)
    setTimeout(() => {
        if (navigator.onLine) {
            sync();
        }
    }, 5000);

    // Periodic sync every 60 seconds
    syncInterval = setInterval(() => {
        if (navigator.onLine && !isSyncing) {
            sync();
        }
    }, 60000);

    // Sync on network reconnect
    onlineHandler = () => {
        console.log('[SYNC] Network reconnected, syncing...');
        setTimeout(sync, 3000);
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
// SYNC — PROCESS ALL PENDING ORDERS
// ============================================

export const sync = async () => {
    if (isSyncing) {
        console.log('[SYNC] Already in progress');
        return;
    }

    if (!navigator.onLine) {
        console.log('[SYNC] Offline - skipping');
        return;
    }

    const online = await isFullyOnline();
    if (!online) {
        console.log('[SYNC] Server not reachable - skipping');
        return;
    }

    isSyncing = true;
    console.log('[SYNC] Starting sync...');

    try {
        const context = getUserContext();
        const allPending = await getPendingOfflineOrders();
        
        // Filter by current user's company and branch
        const pendingOrders = allPending.filter(order => 
            order.company_id === context.company_id && 
            order.branch_id === context.branch_id
        );

        if (pendingOrders.length === 0) {
            console.log('[SYNC] No pending orders for this branch');
            isSyncing = false;
            return;
        }

        console.log(`[SYNC] Found ${pendingOrders.length} pending orders for branch ${context.branch_id}`);

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
        await updateOfflineOrderStatus(order.id, 'syncing');

        console.log(`[SYNC] Processing order ${order.id}`);

        // Send to server with idempotency key
        const response = await API.post('/orders', order.payload, {
            headers: {
                'Idempotency-Key': order.idempotency_key
            }
        });

        if (response.data.success) {
            await deleteOfflineOrder(order.id);
            console.log(`[SYNC] Order ${order.id} synced successfully`);
            return 'synced';
        }

        const errorMsg = response.data.error || 'Unknown server error';
        await updateOfflineOrderStatus(order.id, 'failed', errorMsg);
        console.error(`[SYNC] Order ${order.id} failed:`, errorMsg);
        return 'failed';

    } catch (error) {
        const status = error.response?.status;
        const errorMsg = error.response?.data?.error || error.message;

        // Auth error - give up
        if (status === 401 || status === 403) {
            await updateOfflineOrderStatus(order.id, 'failed', `Auth error: ${errorMsg}`);
            console.error(`[SYNC] Order ${order.id} auth failed:`, errorMsg);
            return 'failed';
        }

        // Duplicate - already exists on server
        if (status === 409) {
            await deleteOfflineOrder(order.id);
            console.log(`[SYNC] Order ${order.id} already exists (duplicate)`);
            return 'synced';
        }

        // Retry logic - max 5 attempts
        const attempts = (order.attempts || 0) + 1;
        if (attempts >= 5) {
            await updateOfflineOrderStatus(order.id, 'failed', `Max retries exceeded: ${errorMsg}`);
            console.error(`[SYNC] Order ${order.id} failed permanently (${attempts} attempts)`);
            return 'failed';
        }

        // Requeue for retry
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
        const context = getUserContext();
        const allPending = await getPendingOfflineOrders();
        const branchPending = allPending.filter(order => 
            order.company_id === context.company_id && 
            order.branch_id === context.branch_id
        );
        const total = await getCount('offline_orders');
        
        return {
            total: total || 0,
            pending: branchPending?.length || 0,
            isSyncing: isSyncing,
            hasPending: branchPending?.length > 0
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