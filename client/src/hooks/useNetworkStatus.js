// client/src/hooks/useNetworkStatus.js

import { useState, useEffect, useCallback, useRef } from 'react';

// ✅ Get API URL from environment or use relative path
const API_URL = process.env.REACT_APP_API_URL || '';

export const useNetworkStatus = () => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isServerReachable, setIsServerReachable] = useState(navigator.onLine);
    const [checkingServer, setCheckingServer] = useState(false);
    const isMounted = useRef(true);
    const isOfflineRef = useRef(!navigator.onLine);
    const intervalRef = useRef(null);

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

            // ✅ FIX: Use API_URL for health check
            const healthUrl = API_URL ? `${API_URL}/health` : '/health';
            const response = await fetch(healthUrl, {
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
            // Don't update state if we're already offline
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
            if (!isMounted.current) return;
            setIsOnline(true);
            isOfflineRef.current = false;
            // Check server when coming back online
            checkServer();
        };

        const handleOffline = () => {
            if (!isMounted.current) return;
            setIsOnline(false);
            setIsServerReachable(false);
            isOfflineRef.current = true;
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Only check server initially if online
        if (navigator.onLine) {
            checkServer();
        } else {
            setIsServerReachable(false);
        }

        // ✅ FIX: Only check when online, and clear interval properly
        intervalRef.current = setInterval(() => {
            // Skip if offline or component unmounted
            if (!isMounted.current || !navigator.onLine) {
                return;
            }
            checkServer();
        }, 60000);

        return () => {
            isMounted.current = false;
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
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