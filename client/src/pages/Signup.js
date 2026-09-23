import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Store, Mail, Lock, User, Phone, Loader2, Eye, EyeOff, CheckCircle } from 'lucide-react';
import API from '../api/axios';

const Signup = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      await API.post('/auth/signup', formData);
      setSuccess(true);
      setFormData({ name: '', email: '', password: '', phone: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-50 dark:bg-gray-900 p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-white dark:bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-200 dark:border-gray-700 p-8">
            <CheckCircle size={64} className="mx-auto text-green-500 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-900 dark:text-white mb-2">Account Created!</h2>
            <p className="text-gray-500 dark:text-gray-500 dark:text-gray-400 mb-6">
              Your account has been created and is pending admin approval.
              You will be notified once approved.
            </p>
            <Link to="/login" className="inline-block bg-blue-600 hover:bg-blue-700 text-gray-900 dark:text-gray-900 dark:text-white font-semibold py-2 px-6 rounded-lg transition">
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-50 dark:bg-gray-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-blue-600 mb-4 shadow-xl">
            <Store className="text-gray-900 dark:text-gray-900 dark:text-white" size={40} />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-900 dark:text-white">ZenTech</h1>
          <p className="text-gray-500 dark:text-gray-500 dark:text-gray-400 mt-2">Create your account</p>
        </div>

        <div className="bg-white dark:bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-200 dark:border-gray-700 p-6 shadow-xl">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-600 dark:text-gray-300 mb-1">Full Name *</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 pl-10 text-gray-900 dark:text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="John Doe"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-600 dark:text-gray-300 mb-1">Email *</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 pl-10 text-gray-900 dark:text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="john@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-600 dark:text-gray-300 mb-1">Phone</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 pl-10 text-gray-900 dark:text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+251 XXX XXX XXX"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-600 dark:text-gray-300 mb-1">Password *</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 pl-10 pr-12 text-gray-900 dark:text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Min 6 characters"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-600 dark:text-gray-600 dark:text-gray-300"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-gray-900 dark:text-gray-900 dark:text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Creating Account...
                </>
              ) : (
                'Sign Up'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-500 dark:text-gray-500 dark:text-gray-400 text-sm">
              Already have an account?{' '}
              <Link to="/login" className="text-blue-400 hover:text-blue-300">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;