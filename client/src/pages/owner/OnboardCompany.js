// client/src/pages/owner/OnboardCompany.jsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, MapPin, Phone, User, Mail, Lock, Loader2 } from 'lucide-react';
import { onboardCompany } from '../../api/companies';
import { useLanguage } from '../../context/LanguageContext';

const OnboardCompany = () => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        company: {
            name: ''
        },
        branch: {
            name: '',
            address: '',
            phone: ''
        },
        owner: {
            name: '',
            email: '',
            password: '',
            phone: ''
        }
    });

    const handleChange = (section, field, value) => {
        setFormData(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                [field]: value
            }
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const result = await onboardCompany(formData);
            
            if (result.success) {
                // Store the token and user info
                localStorage.setItem('token', result.data.token);
                localStorage.setItem('user', JSON.stringify(result.data.owner));
                
                // Navigate to owner dashboard
                navigate('/owner/dashboard');
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to onboard company');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
            <div className="max-w-2xl mx-auto">
                <div className="text-center mb-8">
                    <Building2 size={48} className="mx-auto text-blue-600 dark:text-blue-400 mb-4" />
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Onboard New Company
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2">
                        Create a new restaurant company with its first branch and owner
                    </p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-lg">
                    {/* Company Section */}
                    <div className="mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <Building2 size={20} className="text-blue-600 dark:text-blue-400" />
                            Company Information
                        </h2>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Company Name *
                            </label>
                            <input
                                type="text"
                                required
                                minLength="2"
                                value={formData.company.name}
                                onChange={(e) => handleChange('company', 'name', e.target.value)}
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="e.g., ABC Restaurant"
                            />
                        </div>
                    </div>

                    {/* Branch Section */}
                    <div className="mb-6 border-t border-gray-200 dark:border-gray-700 pt-6">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <MapPin size={20} className="text-green-600 dark:text-green-400" />
                            First Branch
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Branch Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.branch.name}
                                    onChange={(e) => handleChange('branch', 'name', e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g., Main Branch"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Address
                                </label>
                                <input
                                    type="text"
                                    value={formData.branch.address}
                                    onChange={(e) => handleChange('branch', 'address', e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Addis Ababa, Ethiopia"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Phone
                                </label>
                                <input
                                    type="tel"
                                    value={formData.branch.phone}
                                    onChange={(e) => handleChange('branch', 'phone', e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="+251-XXX-XXX-XXX"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Owner Section */}
                    <div className="mb-6 border-t border-gray-200 dark:border-gray-700 pt-6">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <User size={20} className="text-purple-600 dark:text-purple-400" />
                            Owner Account
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Full Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    minLength="2"
                                    value={formData.owner.name}
                                    onChange={(e) => handleChange('owner', 'name', e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="John Doe"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Email Address *
                                </label>
                                <input
                                    type="email"
                                    required
                                    value={formData.owner.email}
                                    onChange={(e) => handleChange('owner', 'email', e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="owner@restaurant.com"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Password *
                                </label>
                                <input
                                    type="password"
                                    required
                                    minLength="6"
                                    value={formData.owner.password}
                                    onChange={(e) => handleChange('owner', 'password', e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Min 6 characters"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Phone
                                </label>
                                <input
                                    type="tel"
                                    value={formData.owner.phone}
                                    onChange={(e) => handleChange('owner', 'phone', e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="+251-XXX-XXX-XXX"
                                />
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-bold text-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="animate-spin" size={20} />
                                Creating Company...
                            </>
                        ) : (
                            'Create Company'
                        )}
                    </button>

                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-4">
                        This will create a new company with its first branch and owner account.
                        The owner will have full access to manage the company.
                    </p>
                </form>
            </div>
        </div>
    );
};

export default OnboardCompany;