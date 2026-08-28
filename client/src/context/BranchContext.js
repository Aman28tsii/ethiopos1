// client/src/context/BranchContext.js

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

    // Load branches on mount
    const loadBranches = useCallback(async () => {
        setLoading(true);
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
        } catch (err) {
            console.error('Load branches error:', err);
            setError(err.response?.data?.error || 'Failed to load branches');
        } finally {
            setLoading(false);
        }
    }, []);

    // Switch branch
    const switchBranch = useCallback(async (branchId) => {
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
                
                // Reload page to refresh all data with new branch
                window.location.reload();
                
                return { success: true, branch: branchData };
            }
        } catch (err) {
            console.error('Switch branch error:', err);
            setError(err.response?.data?.error || 'Failed to switch branch');
            return { success: false, error: err.response?.data?.error };
        } finally {
            setLoading(false);
        }
    }, [branches]);

    // Load branches on mount
    useEffect(() => {
        loadBranches();
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