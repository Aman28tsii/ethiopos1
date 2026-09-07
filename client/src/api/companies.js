// client/src/api/companies.js

import API from './axios';

// ============================================
// ONBOARD NEW COMPANY
// ============================================
export const onboardCompany = async (data) => {
    try {
        const response = await API.post('/companies/onboard', data);
        return response.data;
    } catch (error) {
        console.error('Onboard company error:', error);
        throw error;
    }
};

// ============================================
// GET COMPANY INFO
// ============================================
export const getCompanyInfo = async (companyId) => {
    try {
        const response = await API.get(`/companies/${companyId}`);
        return response.data;
    } catch (error) {
        console.error('Get company info error:', error);
        throw error;
    }
};

// ============================================
// LIST ALL COMPANIES
// ============================================
export const listCompanies = async () => {
    try {
        const response = await API.get('/companies');
        return response.data;
    } catch (error) {
        console.error('List companies error:', error);
        throw error;
    }
};