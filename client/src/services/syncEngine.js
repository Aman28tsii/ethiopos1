// client/src/services/syncEngine.js

import API from '../api/axios';
import {
    getPendingOfflineOrders,
    getAllOfflineOrders,
    updateOfflineOrderStatus,
    deleteOfflineOrder,
    getCount
} from './offlineDB';

let isSyncing = false;
let syncInterval = null;

export const startSyncEngine = async () => {
    if (syncInterval) {
        clearInterval(syncInterval);
    }

    // Initial sync
    await sync();

    // Sync every 30 seconds when online
    syncInterval = setInterval(async () => {
        if (navigator.onLine) {
            await sync();
        }
    }, 30000);

    // Also sync on network reconnect
    window.addEventListener('online', () => {
        setTimeout(sync, 2000);
    });

    console.log('🔄 Sync engine started');
};

export const stopSyncEngine = () => {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
    console.log('⏹️ Sync engine stopped');
};

export const sync = async () => {
    if (isSyncing) {
        console.log('⏳ Sync already in progress');
        return;
    }

    if (!navigator.onLine) {
        console.log('📡 Offline - skipping sync');
        return;
    }

    isSyncing = true;
    console.log('🔄 Starting sync...');

    try {
        const pendingOrders = await getPendingOfflineOrders();
        
        if (pendingOrders.length === 0) {
            console.log('✅ No pending orders to sync');
            isSyncing = false;
            return;
        }

        console.log(`📤 Syncing ${pendingOrders.length} orders...`);

        let synced = 0;
        let failed = 0;

        for (const order of pendingOrders) {
            try {
                // Mark as syncing
                await updateOfflineOrderStatus(order.id, 'syncing');

                // Send to server
                const response = await API.post('/orders', order.payload, {
                    headers: {
                        'Idempotency-Key': order.idempotency_key
                    }
                });

                if (response.data.success) {
                    // Order synced successfully
                    await deleteOfflineOrder(order.id);
                    synced++;
                    console.log(`✅ Order ${order.id} synced successfully`);
                } else {
                    // Server returned error
                    await updateOfflineOrderStatus(order.id, 'failed', response.data.error);
                    failed++;
                    console.error(`❌ Order ${order.id} failed:`, response.data.error);
                }

            } catch (error) {
                const status = error.response?.status;
                const errorMessage = error.response?.data?.error || error.message;

                if (status === 401 || status === 403) {
                    // Authentication/authorization failure - don't retry
                    await updateOfflineOrderStatus(order.id, 'failed', `Auth error: ${errorMessage}`);
                    failed++;
                    console.error(`🔒 Order ${order.id} auth failed:`, errorMessage);
                } else if (status === 400) {
                    // Validation error - don't retry
                    await updateOfflineOrderStatus(order.id, 'failed', `Validation error: ${errorMessage}`);
                    failed++;
                    console.error(`❌ Order ${order.id} validation failed:`, errorMessage);
                } else if (status === 409) {
                    // Duplicate - already processed
                    await deleteOfflineOrder(order.id);
                    synced++;
                    console.log(`⚠️ Order ${order.id} already exists (duplicate)`);
                } else {
                    // Network or server error - keep for retry
                    const attempts = (order.attempts || 0) + 1;
                    if (attempts >= 5) {
                        await updateOfflineOrderStatus(order.id, 'failed', `Max retries exceeded: ${errorMessage}`);
                        failed++;
                    } else {
                        await updateOfflineOrderStatus(order.id, 'pending', errorMessage);
                        console.log(`🔄 Order ${order.id} will retry (attempt ${attempts}/5)`);
                    }
                }
            }
        }

        console.log(`✅ Sync complete: ${synced} synced, ${failed} failed`);

    } catch (error) {
        console.error('❌ Sync error:', error);
    } finally {
        isSyncing = false;
    }
};

export const getSyncStatus = async () => {
    try {
        const total = await getCount('offline_orders');
        const pending = await getPendingOfflineOrders();
        return {
            total,
            pending: pending.length,
            isSyncing,
            hasPending: total > 0
        };
    } catch (error) {
        return { total: 0, pending: 0, isSyncing: false, hasPending: false };
    }
};

export const retryFailedOrder = async (orderId) => {
    await updateOfflineOrderStatus(orderId, 'pending', null);
    // Trigger sync immediately
    await sync();
};

export const clearAllOfflineOrders = async () => {
    const orders = await getAllOfflineOrders();
    for (const order of orders) {
        await deleteOfflineOrder(order.id);
    }
};