// client/src/services/offlineDB.js

const DB_NAME = 'EthioPOSOfflineDB';
const DB_VERSION = 1;

let db = null;

export const openDB = () => {
    return new Promise((resolve, reject) => {
        if (db && db.name === DB_NAME) {
            resolve(db);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const database = event.target.result;

            // Store for products
            if (!database.objectStoreNames.contains('products')) {
                const productStore = database.createObjectStore('products', { keyPath: 'id' });
                productStore.createIndex('company_id', 'company_id', { unique: false });
                productStore.createIndex('branch_id', 'branch_id', { unique: false });
                productStore.createIndex('updated_at', 'updated_at', { unique: false });
            }

            // Store for categories
            if (!database.objectStoreNames.contains('categories')) {
                const categoryStore = database.createObjectStore('categories', { keyPath: 'id' });
                categoryStore.createIndex('company_id', 'company_id', { unique: false });
                categoryStore.createIndex('updated_at', 'updated_at', { unique: false });
            }

            // Store for tables
            if (!database.objectStoreNames.contains('tables')) {
                const tableStore = database.createObjectStore('tables', { keyPath: 'id' });
                tableStore.createIndex('branch_id', 'branch_id', { unique: false });
                tableStore.createIndex('updated_at', 'updated_at', { unique: false });
            }

            // Store for cart
            if (!database.objectStoreNames.contains('cart')) {
                const cartStore = database.createObjectStore('cart', { keyPath: 'id' });
                cartStore.createIndex('branch_id', 'branch_id', { unique: false });
                cartStore.createIndex('updated_at', 'updated_at', { unique: false });
            }

            // Store for offline orders (sync queue)
            if (!database.objectStoreNames.contains('offline_orders')) {
                const orderStore = database.createObjectStore('offline_orders', { keyPath: 'id' });
                orderStore.createIndex('status', 'status', { unique: false });
                orderStore.createIndex('company_id', 'company_id', { unique: false });
                orderStore.createIndex('branch_id', 'branch_id', { unique: false });
                orderStore.createIndex('created_at', 'created_at', { unique: false });
                orderStore.createIndex('idempotency_key', 'idempotency_key', { unique: true });
            }

            // Store for sync metadata
            if (!database.objectStoreNames.contains('sync_metadata')) {
                database.createObjectStore('sync_metadata', { keyPath: 'key' });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
};

// ============================================
// GENERIC CRUD OPERATIONS
// ============================================

export const saveToStore = async (storeName, data) => {
    try {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            request.onsuccess = () => resolve(data);
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        console.warn('IndexedDB save failed:', err);
        return null;
    }
};

export const saveManyToStore = async (storeName, dataArray) => {
    if (!dataArray || dataArray.length === 0) return [];
    try {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            let completed = 0;
            let errors = [];

            dataArray.forEach((item) => {
                const request = store.put(item);
                request.onsuccess = () => {
                    completed++;
                    if (completed === dataArray.length) {
                        resolve(dataArray);
                    }
                };
                request.onerror = () => {
                    errors.push(request.error);
                    completed++;
                    if (completed === dataArray.length) {
                        reject(errors);
                    }
                };
            });
        });
    } catch (err) {
        console.warn('IndexedDB save many failed:', err);
        return [];
    }
};

export const getFromStore = async (storeName, key) => {
    try {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        console.warn('IndexedDB get failed:', err);
        return null;
    }
};

export const getAllFromStore = async (storeName) => {
    try {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        console.warn('IndexedDB get all failed:', err);
        return [];
    }
};

export const getByIndex = async (storeName, indexName, value) => {
    try {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        console.warn('IndexedDB get by index failed:', err);
        return [];
    }
};

export const deleteFromStore = async (storeName, key) => {
    try {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        console.warn('IndexedDB delete failed:', err);
    }
};

export const deleteAllFromStore = async (storeName) => {
    try {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        console.warn('IndexedDB clear failed:', err);
    }
};

export const getCount = async (storeName) => {
    try {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (err) {
        console.warn('IndexedDB count failed:', err);
        return 0;
    }
};

// ============================================
// PRODUCT OPERATIONS
// ============================================

export const saveProducts = async (products, branchId, companyId) => {
    if (!products || products.length === 0) return;
    const data = products.map(p => ({
        ...p,
        branch_id: branchId,
        company_id: companyId,
        updated_at: new Date().toISOString()
    }));
    await saveManyToStore('products', data);
};

export const getProducts = async (branchId) => {
    if (!branchId) return [];
    const result = await getByIndex('products', 'branch_id', branchId);
    return result || [];
};

// ============================================
// CATEGORY OPERATIONS
// ============================================

export const saveCategories = async (categories, companyId) => {
    if (!categories || categories.length === 0) return;
    const data = categories.map(c => ({
        ...c,
        company_id: companyId,
        updated_at: new Date().toISOString()
    }));
    await saveManyToStore('categories', data);
};

export const getCategories = async (companyId) => {
    if (!companyId) return [];
    const result = await getByIndex('categories', 'company_id', companyId);
    return result || [];
};

// ============================================
// TABLE OPERATIONS
// ============================================

export const saveTables = async (tables, branchId) => {
    if (!tables || tables.length === 0) return;
    const data = tables.map(t => ({
        ...t,
        branch_id: branchId,
        updated_at: new Date().toISOString()
    }));
    await saveManyToStore('tables', data);
};

export const getTables = async (branchId) => {
    if (!branchId) return [];
    const result = await getByIndex('tables', 'branch_id', branchId);
    return result || [];
};

// ============================================
// CART OPERATIONS
// ============================================

export const saveCart = async (cart, branchId) => {
    const cartData = {
        id: 'active_cart',
        items: cart,
        branch_id: branchId,
        updated_at: new Date().toISOString()
    };
    await saveToStore('cart', cartData);
};

export const getCart = async () => {
    return await getFromStore('cart', 'active_cart');
};

export const clearCart = async () => {
    await deleteFromStore('cart', 'active_cart');
};

// ============================================
// OFFLINE ORDER OPERATIONS
// ============================================

export const saveOfflineOrder = async (order) => {
    const orderData = {
        ...order,
        status: 'pending',
        created_at: new Date().toISOString(),
        attempts: 0
    };
    await saveToStore('offline_orders', orderData);
    return orderData;
};

export const getPendingOfflineOrders = async () => {
    return await getByIndex('offline_orders', 'status', 'pending');
};

export const getAllOfflineOrders = async () => {
    return await getAllFromStore('offline_orders');
};

export const updateOfflineOrderStatus = async (id, status, error = null) => {
    const order = await getFromStore('offline_orders', id);
    if (order) {
        order.status = status;
        order.last_error = error;
        order.updated_at = new Date().toISOString();
        if (status === 'syncing') {
            order.attempts = (order.attempts || 0) + 1;
        }
        await saveToStore('offline_orders', order);
    }
    return order;
};

export const deleteOfflineOrder = async (id) => {
    await deleteFromStore('offline_orders', id);
};

export const deleteAllOfflineOrders = async () => {
    await deleteAllFromStore('offline_orders');
};

// ============================================
// SYNC METADATA
// ============================================

export const getSyncMetadata = async (key) => {
    return await getFromStore('sync_metadata', key);
};

export const setSyncMetadata = async (key, value) => {
    await saveToStore('sync_metadata', { key, value, updated_at: new Date().toISOString() });
};

export const getLastSyncTime = async () => {
    const data = await getSyncMetadata('last_sync');
    return data?.value || null;
};

export const setLastSyncTime = async (time) => {
    await setSyncMetadata('last_sync', time);
};