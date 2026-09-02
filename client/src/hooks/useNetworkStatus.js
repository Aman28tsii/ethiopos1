// client/src/hooks/useNetworkStatus.js

import { useState, useEffect, useCallback, useRef } from 'react';

export const useNetworkStatus = () => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isServerReachable, setIsServerReachable] = useState(navigator.onLine);
    const [checkingServer, setCheckingServer] = useState(false);
    const isMounted = useRef(true);
    const isOfflineRef = useRef(!navigator.onLine);

    const checkServer = useCallback(async () => {
        // Skip if offline
        if (!navigator.onLine) {
            if (isMounted.current) {
                setIsServerReachable(false);
            }
            return false;
        }

        // Skip if already checking
        if (checkingServer) return false;

        if (isMounted.current) {
            setCheckingServer(true);
        }
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            const response = await fetch('/health', {
                method: 'GET',
                signal: controller.signal,
                headers: { 'Cache-Control': 'no-cache' }
            });

            clearTimeout(timeoutId);

            if (isMounted.current) {
                setIsServerReachable(response.ok);
            }
            return response.ok;
        } catch (error) {
            // ✅ Don't update state if we're already offline
            if (isMounted.current) {
                setIsServerReachable(false);
            }
            return false;
        } finally {
            if (isMounted.current) {
                setCheckingServer(false);
            }
        }
    }, [checkingServer]);

    useEffect(() => {
        isMounted.current = true;

        const handleOnline = () => {
            setIsOnline(true);
            isOfflineRef.current = false;
            // Check server when coming back online
            checkServer();
        };

        const handleOffline = () => {
            setIsOnline(false);
            setIsServerReachable(false);
            isOfflineRef.current = true;
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // ✅ Only check server initially if online
        if (navigator.onLine) {
            checkServer();
        } else {
            setIsServerReachable(false);
        }

        // ✅ Reduce check frequency and only check when online
        const interval = setInterval(() => {
            // ✅ Skip if offline or component unmounted
            if (!isMounted.current || !navigator.onLine) {
                return;
            }
            checkServer();
        }, 60000); // ✅ Increased from 30000 to 60000

        return () => {
            isMounted.current = false;
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