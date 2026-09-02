// client/src/context/BranchContext.js

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import API from '../api/axios';

const BranchContext = createContext();

export const useBranch = () => {
    const context = useContext(BranchContext);
    if (!context) {
        throw new Error('useBranch must be used within BranchProvider');
    }
    return context;
};

export const BranchProvider = ({ children }) => {
    const [branches, setBranches] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isOwner, setIsOwner] = useState(false);
    const isLoadingRef = useRef(false);
    const initialLoadDone = useRef(false);
    const loadTimeoutRef = useRef(null);

    const loadBranches = useCallback(async (silent = false) => {
        // Prevent concurrent loads
        if (isLoadingRef.current) {
            console.log('[BRANCH] Load already in progress, skipping');
            return;
        }
        
        // Prevent multiple initial loads
        if (initialLoadDone.current && !silent) {
            console.log('[BRANCH] Initial load already done, skipping');
            return;
        }
        
        // Don't load if no token
        const token = localStorage.getItem('token');
        if (!token) {
            console.log('[BRANCH] No token, skipping load');
            if (!silent) setLoading(false);
            return;
        }
        
        isLoadingRef.current = true;
        if (!silent) setLoading(true);
        setError(null);
        
        try {
            const response = await API.get('/auth/branches');
            const branchesData = response.data.data || [];
            setBranches(branchesData);
            
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const isOwnerOrAdmin = user.role === 'owner' || user.role === 'admin';
            setIsOwner(isOwnerOrAdmin);
            
            if (branchesData.length > 0 && isOwnerOrAdmin) {
                const savedBranchId = localStorage.getItem('ethiopos_selected_branch');
                const savedBranch = branchesData.find(b => b.id === parseInt(savedBranchId));
                
                if (savedBranch) {
                    setSelectedBranch(savedBranch);
                } else {
                    setSelectedBranch(branchesData[0]);
                }
            } else if (branchesData.length > 0) {
                const userBranchId = user.branch_id;
                const userBranch = branchesData.find(b => b.id === userBranchId);
                if (userBranch) {
                    setSelectedBranch(userBranch);
                } else {
                    setSelectedBranch(branchesData[0]);
                }
            }
            
            initialLoadDone.current = true;
        } catch (err) {
            console.error('Load branches error:', err);
            // Don't set error for 401 - it will redirect
            if (err.response?.status !== 401) {
                setError(err.response?.data?.error || 'Failed to load branches');
            }
        } finally {
            if (!silent) setLoading(false);
            isLoadingRef.current = false;
        }
    }, []);

    const switchBranch = useCallback(async (branchId) => {
        if (isLoadingRef.current) {
            return { success: false, error: 'Switch already in progress' };
        }
        
        isLoadingRef.current = true;
        setLoading(true);
        setError(null);
        try {
            const response = await API.post('/auth/switch-branch', { branchId });
            
            if (response.data.success) {
                const { token, user, branch } = response.data;
                
                localStorage.setItem('token', token);
                localStorage.setItem('user', JSON.stringify(user));
                localStorage.setItem('ethiopos_selected_branch', String(branchId));
                
                const branchData = branches.find(b => b.id === branchId) || branch;
                setSelectedBranch(branchData);
                
                API.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                
                // ✅ FIX: Use React Router navigation instead of reload
                // window.location.reload(); // REMOVED - causes flickering
                
                return { success: true, branch: branchData };
            }
        } catch (err) {
            console.error('Switch branch error:', err);
            setError(err.response?.data?.error || 'Failed to switch branch');
            return { success: false, error: err.response?.data?.error };
        } finally {
            setLoading(false);
            isLoadingRef.current = false;
        }
    }, [branches]);

    // Load branches on mount - ONLY ONCE with delay
    useEffect(() => {
        // Clear any pending timeout
        if (loadTimeoutRef.current) {
            clearTimeout(loadTimeoutRef.current);
        }
        
        loadTimeoutRef.current = setTimeout(() => {
            if (!initialLoadDone.current) {
                const token = localStorage.getItem('token');
                if (token) {
                    loadBranches();
                } else {
                    setLoading(false);
                }
            }
        }, 500);
        
        return () => {
            if (loadTimeoutRef.current) {
                clearTimeout(loadTimeoutRef.current);
            }
        };
    }, [loadBranches]);

    const value = {
        branches,
        selectedBranch,
        loading,
        error,
        isOwner,
        switchBranch,
        loadBranches,
        setSelectedBranch
    };

    return (
        <BranchContext.Provider value={value}>
            {children}
        </BranchContext.Provider>
    );
};

export default BranchProvider;