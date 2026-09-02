// client/src/socket.js
import io from 'socket.io-client';

// ✅ FIX: Use the same URL as the API
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || window.location.origin;

let socket = null;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 5000;
let connectionTimeout = null;
let reconnectTimer = null;

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

// Check if we should attempt connection
const shouldAttemptConnection = () => {
    if (!navigator.onLine) {
        console.log('[SOCKET] Offline - skipping connection');
        return false;
    }
    if (isConnected && socket && socket.connected) {
        return false;
    }
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('[SOCKET] Max reconnect attempts reached');
        return false;
    }
    return true;
};

// Connect to Socket.IO
export const connectSocket = () => {
    // Clear any pending reconnect attempts
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    if (socket && isConnected && socket.connected) {
        console.log('[SOCKET] Already connected');
        return socket;
    }

    if (!shouldAttemptConnection()) {
        return null;
    }

    const token = getToken();
    if (!token) {
        console.log('[SOCKET] No token, skipping connection');
        return null;
    }

    const context = getUserContext();
    console.log('[SOCKET] Connecting to:', SOCKET_URL);

    try {
        // ✅ FIX: Close existing socket if any
        if (socket) {
            socket.disconnect();
            socket = null;
        }

        socket = io(SOCKET_URL, {
            path: '/socket.io',
            transports: ['polling', 'websocket'],
            auth: { token: token },
            query: {
                company_id: context.company_id,
                branch_id: context.branch_id,
                role: context.role
            },
            reconnection: true,
            reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
            reconnectionDelay: RECONNECT_DELAY,
            reconnectionDelayMax: 10000,
            timeout: 10000,
            upgrade: true,
            forceNew: true,
            withCredentials: true
        });

        socket.on('connect', () => {
            console.log('[SOCKET] Connected successfully');
            console.log('[SOCKET] Socket ID:', socket.id);
            isConnected = true;
            reconnectAttempts = 0;
            
            // Join branch room
            socket.emit('join_branch', {
                company_id: context.company_id,
                branch_id: context.branch_id,
                role: context.role,
                user_id: context.id
            });

            if (context.role) {
                socket.emit(`join_${context.role}`, {
                    user_id: context.id,
                    branch_id: context.branch_id
                });
            }
        });

        socket.on('connect_error', (error) => {
            console.log('[SOCKET] Connection error:', error.message);
            isConnected = false;
            reconnectAttempts++;
            
            if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                console.log('[SOCKET] Max attempts reached, giving up');
                if (socket) {
                    socket.disconnect();
                }
            }
        });

        socket.on('disconnect', (reason) => {
            console.log('[SOCKET] Disconnected:', reason);
            isConnected = false;
        });

        socket.on('reconnect', (attemptNumber) => {
            console.log(`[SOCKET] Reconnected after ${attemptNumber} attempts`);
            isConnected = true;
            const ctx = getUserContext();
            socket.emit('join_branch', {
                company_id: ctx.company_id,
                branch_id: ctx.branch_id,
                role: ctx.role,
                user_id: ctx.id
            });
        });

        socket.on('reconnect_attempt', (attempt) => {
            console.log(`[SOCKET] Reconnect attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS}`);
        });

        socket.on('reconnect_error', (error) => {
            console.log('[SOCKET] Reconnect error:', error.message);
        });

        socket.on('reconnect_failed', () => {
            console.log('[SOCKET] Reconnect failed - giving up');
            isConnected = false;
        });

        socket.io.engine.on('upgrade', (transport) => {
            console.log('[SOCKET] Transport upgraded to:', transport.name);
        });

        socket.io.engine.on('error', (error) => {
            console.log('[SOCKET] Engine error:', error);
        });

        return socket;
    } catch (error) {
        console.error('[SOCKET] Connection error:', error);
        return null;
    }
};

// Disconnect Socket.IO
export const disconnectSocket = () => {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (socket) {
        console.log('[SOCKET] Disconnecting...');
        socket.disconnect();
        socket = null;
        isConnected = false;
        reconnectAttempts = 0;
    }
};

// Get socket instance - ✅ FIX: Don't auto-connect
export const getSocket = () => {
    if (!navigator.onLine) {
        console.log('[SOCKET] Offline - returning null');
        return null;
    }
    if (!socket || !isConnected) {
        console.log('[SOCKET] Socket not connected, call connectSocket() first');
        return null;
    }
    return socket;
};

// Check if socket is connected
export const isSocketConnected = () => {
    return isConnected && socket && socket.connected;
};

// Emit event
export const emitEvent = (event, data) => {
    if (!navigator.onLine) {
        console.log(`[SOCKET] Offline - cannot emit ${event}`);
        return false;
    }
    if (!socket || !isConnected) {
        console.log(`[SOCKET] Cannot emit ${event} - not connected`);
        return false;
    }
    socket.emit(event, data);
    return true;
};

// Listen for event
export const onEvent = (event, callback) => {
    if (socket) {
        socket.on(event, callback);
    }
};

// Off event
export const offEvent = (event, callback) => {
    if (socket) {
        socket.off(event, callback);
    }
};

// Handle online/offline events
export const setupOfflineHandlers = () => {
    const handleOnline = () => {
        console.log('[SOCKET] Network online - attempting reconnect');
        // ✅ FIX: Don't auto-connect, let the app decide
        // Just reset the reconnect attempts
        reconnectAttempts = 0;
    };
    
    const handleOffline = () => {
        console.log('[SOCKET] Network offline - disconnecting');
        if (socket) {
            socket.disconnect();
        }
        isConnected = false;
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
};

// Default export
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