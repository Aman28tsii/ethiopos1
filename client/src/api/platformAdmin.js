// client/src/api/platformAdmin.js

import API from './axios';

// Dashboard counts
export const getDashboard = () =>
  API.get('/platform-admin/dashboard').then((r) => r.data);

// List registrations (optional status filter: 'pending' | 'approved' | 'rejected')
export const listRegistrations = (status) =>
  API.get('/platform-admin/registrations', {
    params: status ? { status } : {},
  }).then((r) => r.data);

// One registration (with company / branch / owner snapshots)
export const getRegistration = (id) =>
  API.get(`/platform-admin/registrations/${id}`).then((r) => r.data);

// Actions
export const approveRegistration = (id) =>
  API.post(`/platform-admin/registrations/${id}/approve`).then((r) => r.data);

export const rejectRegistration = (id, reason) =>
  API.post(`/platform-admin/registrations/${id}/reject`, { reason }).then((r) => r.data);