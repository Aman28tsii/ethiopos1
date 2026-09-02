// client/src/socket.js
// ⚠️ TEMPORARILY DISABLED TO STOP FLICKERING

import io from 'socket.io-client';

// ✅ FIX: Completely disable auto-connection to stop flickering
let socket = null;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 0; // ✅ DISABLED

// Get auth token
const getToken = () => {
    return localStorage.getItem('token');
};

// Get user context
const getUserContext = () => {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        return {
            company_id: user.company_id || 1,
            branch_id: user.branch_id || 1,
            role: user.role || 'staff',
            id: user.id
        };
    } catch (e) {
        return { company_id: 1, branch_id: 1, role: 'staff', id: null };
    }
};

// ✅ DISABLED - Return null immediately
export const connectSocket = () => {
    console.log('[SOCKET] Socket connection disabled to prevent flickering');
    return null;
};

// Disconnect Socket.IO
export const disconnectSocket = () => {
    if (socket) {
        console.log('[SOCKET] Disconnecting...');
        socket.disconnect();
        socket = null;
        isConnected = false;
        reconnectAttempts = 0;
    }
};

// Get socket instance - DISABLED
export const getSocket = () => {
    console.log('[SOCKET] Socket disabled - returning null');
    return null;
};

// Check if socket is connected - ALWAYS FALSE
export const isSocketConnected = () => {
    return false;
};

// Emit event - DISABLED
export const emitEvent = (event, data) => {
    console.log(`[SOCKET] Cannot emit ${event} - socket disabled`);
    return false;
};

// Listen for event - DISABLED
export const onEvent = (event, callback) => {
    console.log(`[SOCKET] Cannot listen to ${event} - socket disabled`);
};

// Off event - DISABLED
export const offEvent = (event, callback) => {
    console.log(`[SOCKET] Cannot off ${event} - socket disabled`);
};

// Handle online/offline events - DISABLED
export const setupOfflineHandlers = () => {
    console.log('[SOCKET] Offline handlers disabled');
    return () => {};
};

// Default export - DISABLED
const socketInstance = {
    on: onEvent,
    off: offEvent,
    emit: emitEvent,
    connect: connectSocket,
    disconnect: disconnectSocket,
    isConnected: isSocketConnected,
    setupOfflineHandlers: setupOfflineHandlers
};

export default socketInstance;