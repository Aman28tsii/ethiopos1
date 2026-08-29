// client/src/components/SyncStatus.jsx

import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle, Upload } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { getSyncStatus, sync } from '../services/syncEngine';

const SyncStatus = () => {
    const { isOnline, isServerReachable, isConnected } = useNetworkStatus();
    const [syncStatus, setSyncStatus] = useState({ total: 0, pending: 0, isSyncing: false, hasPending: false });
    const [showDetails, setShowDetails] = useState(false);

    useEffect(() => {
        const updateStatus = async () => {
            const status = await getSyncStatus();
            setSyncStatus(status);
        };

        updateStatus();
        const interval = setInterval(updateStatus, 10000);
        return () => clearInterval(interval);
    }, []);

    const handleSync = async () => {
        if (syncStatus.isSyncing) return;
        await sync();
        const status = await getSyncStatus();
        setSyncStatus(status);
    };

    const getStatusConfig = () => {
        if (syncStatus.isSyncing) {
            return {
                icon: <RefreshCw size={16} className="animate-spin text-blue-500" />,
                text: 'Syncing...',
                bg: 'bg-blue-100 dark:bg-blue-900/30',
                textColor: 'text-blue-700 dark:text-blue-400'
            };
        }

        if (!isOnline || !isServerReachable) {
            return {
                icon: <WifiOff size={16} className="text-red-500" />,
                text: 'Offline',
                bg: 'bg-red-100 dark:bg-red-900/30',
                textColor: 'text-red-700 dark:text-red-400'
            };
        }

        if (syncStatus.hasPending) {
            return {
                icon: <Upload size={16} className="text-yellow-500" />,
                text: `${syncStatus.pending} pending`,
                bg: 'bg-yellow-100 dark:bg-yellow-900/30',
                textColor: 'text-yellow-700 dark:text-yellow-400'
            };
        }

        return {
            icon: <CheckCircle size={16} className="text-green-500" />,
            text: 'Online',
            bg: 'bg-green-100 dark:bg-green-900/30',
            textColor: 'text-green-700 dark:text-green-400'
        };
    };

    const config = getStatusConfig();

    return (
        <div className="relative">
            <button
                onClick={() => setShowDetails(!showDetails)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${config.bg} ${config.textColor} hover:opacity-80`}
            >
                {config.icon}
                <span>{config.text}</span>
                {syncStatus.pending > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-yellow-500 text-white text-xs rounded-full">
                        {syncStatus.pending}
                    </span>
                )}
            </button>

            {showDetails && (
                <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 z-50">
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="font-semibold text-gray-900 dark:text-white">Sync Status</h4>
                        <button
                            onClick={handleSync}
                            disabled={!isConnected || syncStatus.isSyncing}
                            className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1 rounded-lg transition"
                        >
                            {syncStatus.isSyncing ? 'Syncing...' : 'Sync Now'}
                        </button>
                    </div>

                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between text-gray-600 dark:text-gray-400">
                            <span>Status</span>
                            <span className={isConnected ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                {isConnected ? '🟢 Online' : '🔴 Offline'}
                            </span>
                        </div>
                        <div className="flex justify-between text-gray-600 dark:text-gray-400">
                            <span>Pending Orders</span>
                            <span className="text-gray-900 dark:text-white font-medium">{syncStatus.pending}</span>
                        </div>
                        <div className="flex justify-between text-gray-600 dark:text-gray-400">
                            <span>Total Offline Orders</span>
                            <span className="text-gray-900 dark:text-white font-medium">{syncStatus.total}</span>
                        </div>
                        {syncStatus.isSyncing && (
                            <div className="flex justify-between text-gray-600 dark:text-gray-400">
                                <span>Sync Status</span>
                                <span className="text-blue-600 dark:text-blue-400 animate-pulse">In Progress...</span>
                            </div>
                        )}
                    </div>

                    {syncStatus.pending > 0 && (
                        <button
                            onClick={handleSync}
                            className="w-full mt-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition"
                        >
                            Sync Now
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default SyncStatus;