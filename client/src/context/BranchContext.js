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

    // Load branches on mount
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
        
        isLoadingRef.current = true;
        if (!silent) setLoading(true);
        setError(null);
        
        try {
            const response = await API.get('/auth/branches');
            const branchesData = response.data.data || [];
            setBranches(branchesData);
            
            // Check if user is owner/admin
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const isOwnerOrAdmin = user.role === 'owner' || user.role === 'admin';
            setIsOwner(isOwnerOrAdmin);
            
            if (branchesData.length > 0 && isOwnerOrAdmin) {
                // Try to restore saved branch
                const savedBranchId = localStorage.getItem('ethiopos_selected_branch');
                const savedBranch = branchesData.find(b => b.id === parseInt(savedBranchId));
                
                if (savedBranch) {
                    setSelectedBranch(savedBranch);
                } else {
                    // Default to first branch
                    setSelectedBranch(branchesData[0]);
                }
            } else if (branchesData.length > 0) {
                // Staff: use their branch from JWT
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
            setError(err.response?.data?.error || 'Failed to load branches');
        } finally {
            if (!silent) setLoading(false);
            isLoadingRef.current = false;
        }
    }, []);

    // Switch branch
    const switchBranch = useCallback(async (branchId) => {
        if (isLoadingRef.current) {
            console.log('[BRANCH] Switch already in progress, skipping');
            return { success: false, error: 'Switch already in progress' };
        }
        
        isLoadingRef.current = true;
        setLoading(true);
        setError(null);
        try {
            const response = await API.post('/auth/switch-branch', { branchId });
            
            if (response.data.success) {
                const { token, user, branch } = response.data;
                
                // Update localStorage
                localStorage.setItem('token', token);
                localStorage.setItem('user', JSON.stringify(user));
                localStorage.setItem('ethiopos_selected_branch', String(branchId));
                
                // Update selected branch
                const branchData = branches.find(b => b.id === branchId) || branch;
                setSelectedBranch(branchData);
                
                // Update axios default headers
                API.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                
                // ✅ FIX: Use React Router navigation instead of full page reload
                // This prevents the infinite reload loop
                // window.location.reload(); // DISABLED
                
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

    // Load branches on mount - ONLY ONCE
    useEffect(() => {
        if (!initialLoadDone.current) {
            loadBranches();
        }
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