// client/src/socket.js
// Socket.IO is DISABLED to prevent flickering

export const connectSocket = () => {
    console.log('[SOCKET] Socket disabled');
    return null;
};

export const disconnectSocket = () => {
    console.log('[SOCKET] Socket disabled');
};

export const getSocket = () => {
    return null;
};

export const isSocketConnected = () => {
    return false;
};

export const emitEvent = () => {
    return false;
};

export const onEvent = () => {};

export const offEvent = () => {};

export const setupOfflineHandlers = () => {
    return () => {};
};

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