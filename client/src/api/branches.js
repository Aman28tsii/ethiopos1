// client/src/api/branches.js

import API from './axios';

// ============================================
// GET ALL BRANCHES FOR CURRENT COMPANY
// ============================================
export const getBranches = async () => {
    try {
        const response = await API.get('/branches');
        return response.data;
    } catch (error) {
        console.error('Get branches error:', error);
        throw error;
    }
};

// ============================================
// GET SINGLE BRANCH BY ID
// ============================================
export const getBranch = async (id) => {
    try {
        const response = await API.get(`/branches/${id}`);
        return response.data;
    } catch (error) {
        console.error('Get branch error:', error);
        throw error;
    }
};

// ============================================
// CREATE BRANCH
// ============================================
export const createBranch = async (data) => {
    try {
        const response = await API.post('/branches', data);
        return response.data;
    } catch (error) {
        console.error('Create branch error:', error);
        throw error;
    }
};

// ============================================
// UPDATE BRANCH
// ============================================
export const updateBranch = async (id, data) => {
    try {
        const response = await API.put(`/branches/${id}`, data);
        return response.data;
    } catch (error) {
        console.error('Update branch error:', error);
        throw error;
    }
};

// ============================================
// DELETE BRANCH
// ============================================
export const deleteBranch = async (id) => {
    try {
        const response = await API.delete(`/branches/${id}`);
        return response.data;
    } catch (error) {
        console.error('Delete branch error:', error);
        throw error;
    }
};