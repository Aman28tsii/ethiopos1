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
let isInitialized = false;

export const startSyncEngine = async () => {
    // Prevent multiple starts
    if (isInitialized) {
        console.log('🔄 Sync engine already running');
        return;
    }

    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }

    console.log('🔄 Starting sync engine...');
    isInitialized = true;

    // Initial sync (delay to let app load)
    setTimeout(async () => {
        await sync();
    }, 3000);

    // Sync every 60 seconds when online
    syncInterval = setInterval(async () => {
        if (navigator.onLine && !isSyncing) {
            await sync();
        }
    }, 60000);

    // Also sync on network reconnect
    const handleOnline = () => {
        console.log('📡 Network reconnected, syncing...');
        setTimeout(sync, 2000);
    };
    window.addEventListener('online', handleOnline);
    window._syncOnlineHandler = handleOnline;

    console.log('✅ Sync engine started');
};

export const stopSyncEngine = () => {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
    if (window._syncOnlineHandler) {
        window.removeEventListener('online', window._syncOnlineHandler);
        delete window._syncOnlineHandler;
    }
    isInitialized = false;
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
                await updateOfflineOrderStatus(order.id, 'syncing');

                const response = await API.post('/orders', order.payload, {
                    headers: {
                        'Idempotency-Key': order.idempotency_key
                    }
                });

                if (response.data.success) {
                    await deleteOfflineOrder(order.id);
                    synced++;
                    console.log(`✅ Order ${order.id} synced successfully`);
                } else {
                    await updateOfflineOrderStatus(order.id, 'failed', response.data.error);
                    failed++;
                    console.error(`❌ Order ${order.id} failed:`, response.data.error);
                }

            } catch (error) {
                const status = error.response?.status;
                const errorMessage = error.response?.data?.error || error.message;

                if (status === 401 || status === 403) {
                    await updateOfflineOrderStatus(order.id, 'failed', `Auth error: ${errorMessage}`);
                    failed++;
                    console.error(`🔒 Order ${order.id} auth failed:`, errorMessage);
                } else if (status === 409) {
                    await deleteOfflineOrder(order.id);
                    synced++;
                    console.log(`⚠️ Order ${order.id} already exists (duplicate)`);
                } else {
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
            total: total || 0,
            pending: pending?.length || 0,
            isSyncing,
            hasPending: (total || 0) > 0
        };
    } catch (error) {
        return { total: 0, pending: 0, isSyncing: false, hasPending: false };
    }
};

export const retryFailedOrder = async (orderId) => {
    await updateOfflineOrderStatus(orderId, 'pending', null);
    await sync();
};

export const clearAllOfflineOrders = async () => {
    const orders = await getAllOfflineOrders();
    for (const order of orders) {
        await deleteOfflineOrder(order.id);
    }
};