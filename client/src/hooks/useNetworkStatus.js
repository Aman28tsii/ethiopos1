// client/src/hooks/useNetworkStatus.js

import { useState, useEffect, useCallback } from 'react';

export const useNetworkStatus = () => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isServerReachable, setIsServerReachable] = useState(true);
    const [checkingServer, setCheckingServer] = useState(false);

    const checkServer = useCallback(async () => {
        if (!navigator.onLine) {
            setIsServerReachable(false);
            return false;
        }

        setCheckingServer(true);
        try {
            // Use the health endpoint with a short timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            const response = await fetch('/health', {
                method: 'GET',
                signal: controller.signal,
                headers: { 'Cache-Control': 'no-cache' }
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                setIsServerReachable(true);
                return true;
            } else {
                setIsServerReachable(false);
                return false;
            }
        } catch (error) {
            setIsServerReachable(false);
            return false;
        } finally {
            setCheckingServer(false);
        }
    }, []);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            // Check server when coming back online
            checkServer();
        };

        const handleOffline = () => {
            setIsOnline(false);
            setIsServerReachable(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Initial server check
        checkServer();

        // Periodic server check when online
        const interval = setInterval(() => {
            if (navigator.onLine) {
                checkServer();
            }
        }, 30000);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(interval);
        };
    }, [checkServer]);

    return {
        isOnline,
        isServerReachable,
        checkingServer,
        isConnected: isOnline && isServerReachable,
        checkServer
    };
};