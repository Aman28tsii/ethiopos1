// client/src/utils/idempotency.js

/**
 * Generates or retrieves a stable idempotency key for a specific logical operation.
 * This ensures that network retries or double-clicks reuse the same key,
 * preventing duplicate backend processing.
 * 
 * @param {string} operationPrefix - e.g., 'pay_order', 'create_qr_order'
 * @param {string|number} resourceId - e.g., the order ID or a temporary client ID
 * @returns {string} A stable UUID v4 string
 */
export const getStableIdempotencyKey = (operationPrefix, resourceId) => {
    const storageKey = `idem_key_${operationPrefix}_${resourceId}`;
    
    // 1. Check if we already have a key for this specific operation/resource
    let key = sessionStorage.getItem(storageKey);
    
    if (!key) {
        // 2. Generate a new UUID v4
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            key = crypto.randomUUID();
        } else {
            // Fallback for older browsers
            key = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                const r = (Math.random() * 16) | 0;
                const v = c === 'x' ? r : (r & 0x3) | 0x8;
                return v.toString(16);
            });
        }
        // 3. Store it for future retries of the same operation
        sessionStorage.setItem(storageKey, key);
    }
    
    return key;
};

/**
 * Clears the idempotency key for a specific operation after successful completion.
 * This allows the same resource to be operated on again in the future (if applicable).
 */
export const clearIdempotencyKey = (operationPrefix, resourceId) => {
    const storageKey = `idem_key_${operationPrefix}_${resourceId}`;
    sessionStorage.removeItem(storageKey);
};