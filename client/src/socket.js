// client/src/socket.js
import io from 'socket.io-client';

// ✅ FIX: Use window.location.origin instead of hardcoded URL
const SOCKET_URL = window.location.origin;

let socket = null;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

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

// Connect to Socket.IO
export const connectSocket = () => {
    if (socket && isConnected) {
        console.log('[SOCKET] Already connected');
        return socket;
    }

    const token = getToken();
    if (!token) {
        console.log('[SOCKET] No token, skipping connection');
        return null;
    }

    const context = getUserContext();

    console.log('[SOCKET] Connecting to:', SOCKET_URL);
    
    socket = io(SOCKET_URL, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        auth: {
            token: token
        },
        query: {
            company_id: context.company_id,
            branch_id: context.branch_id,
            role: context.role
        },
        reconnection: true,
        reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
    });

    socket.on('connect', () => {
        console.log('[SOCKET] Connected successfully');
        isConnected = true;
        reconnectAttempts = 0;
        
        // Join company/branch room
        socket.emit('join_branch', {
            company_id: context.company_id,
            branch_id: context.branch_id,
            role: context.role,
            user_id: context.id
        });

        // Join role-specific room
        socket.emit(`join_${context.role}`, {
            user_id: context.id,
            branch_id: context.branch_id
        });
    });

    socket.on('connect_error', (error) => {
        console.log('[SOCKET] Connection error:', error.message);
        isConnected = false;
    });

    socket.on('disconnect', (reason) => {
        console.log('[SOCKET] Disconnected:', reason);
        isConnected = false;
    });

    socket.on('reconnect', (attemptNumber) => {
        console.log(`[SOCKET] Reconnected after ${attemptNumber} attempts`);
        isConnected = true;
        // Re-join rooms
        const ctx = getUserContext();
        socket.emit('join_branch', {
            company_id: ctx.company_id,
            branch_id: ctx.branch_id,
            role: ctx.role,
            user_id: ctx.id
        });
    });

    socket.on('reconnect_attempt', (attempt) => {
        console.log(`[SOCKET] Reconnect attempt ${attempt}`);
    });

    return socket;
};

// Disconnect Socket.IO
export const disconnectSocket = () => {
    if (socket) {
        console.log('[SOCKET] Disconnecting...');
        socket.disconnect();
        socket = null;
        isConnected = false;
    }
};

// Get socket instance
export const getSocket = () => {
    if (!socket || !isConnected) {
        return connectSocket();
    }
    return socket;
};

// Check if socket is connected
export const isSocketConnected = () => {
    return isConnected && socket && socket.connected;
};

// Emit event
export const emitEvent = (event, data) => {
    const s = getSocket();
    if (s && isConnected) {
        s.emit(event, data);
        return true;
    }
    console.log(`[SOCKET] Cannot emit ${event} - not connected`);
    return false;
};

// Listen for event
export const onEvent = (event, callback) => {
    const s = getSocket();
    if (s) {
        s.on(event, callback);
    }
};

// Off event
export const offEvent = (event, callback) => {
    const s = getSocket();
    if (s) {
        s.off(event, callback);
    }
};

// Default export for backward compatibility
const socketInstance = {
    on: onEvent,
    off: offEvent,
    emit: emitEvent,
    connect: connectSocket,
    disconnect: disconnectSocket,
    isConnected: isSocketConnected
};

export default socketInstance;