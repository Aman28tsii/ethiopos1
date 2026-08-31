// client/src/context/OfflineContext.js

import React, { createContext, useContext } from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

const OfflineContext = createContext();

export const useOffline = () => {
    const context = useContext(OfflineContext);
    if (!context) {
        throw new Error('useOffline must be used within OfflineProvider');
    }
    return context;
};

export const OfflineProvider = ({ children }) => {
    const { isOnline, isServerReachable, isConnected, checkingServer } = useNetworkStatus();

    const value = {
        isOnline,
        isOffline: !isOnline,
        isServerReachable,
        isConnected,
        checkingServer
    };

    return (
        <OfflineContext.Provider value={value}>
            {children}
        </OfflineContext.Provider>
    );
};