// client/src/hooks/useNetworkStatus.js
import { useState, useEffect, useCallback, useRef } from 'react';

export const useNetworkStatus = () => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isServerReachable, setIsServerReachable] = useState(true);
    const [checkingServer, setCheckingServer] = useState(false);
    const isMounted = useRef(true);
    const intervalRef = useRef(null);
    const initialCheckDone = useRef(false);

    const checkServer = useCallback(async () => {
        if (!navigator.onLine || !isMounted.current) {
            return false;
        }
        if (checkingServer) return false;

        setCheckingServer(true);
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch('https://ethiopos1.onrender.com/health', {
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
            setTimeout(() => {
                if (isMounted.current) {
                    checkServer();
                }
            }, 3000);
        };

        const handleOffline = () => {
            if (!isMounted.current) return;
            setIsOnline(false);
            setIsServerReachable(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Only check once after mount
        if (!initialCheckDone.current && navigator.onLine) {
            initialCheckDone.current = true;
            setTimeout(() => {
                if (isMounted.current) {
                    checkServer();
                }
            }, 5000);
        }

        // Check every 5 minutes instead of 60 seconds
        intervalRef.current = setInterval(() => {
            if (!isMounted.current || !navigator.onLine) {
                return;
            }
            checkServer();
        }, 300000);

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