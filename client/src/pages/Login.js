import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Store, Mail, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import API from '../api/axios';
import { useLanguage } from '../context/LanguageContext';

const Login = ({ onLogin }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!email.trim() || !password.trim()) {
      setError(t('emailPasswordRequired'));
      setLoading(false);
      return;
    }

    try {
      const response = await API.post('/auth/login', { 
        email: email.trim(), 
        password: password 
      });
      
      if (response.data.success) {
        const user = response.data.user;
        const token = response.data.token;
        
        // Call the onLogin callback
        onLogin(user, token);
        
        // Navigate based on role
        const role = user.role;
        if (role === 'admin' || role === 'owner') {
          navigate('/owner/dashboard');
        } else if (role === 'manager') {
          navigate('/manager/dashboard');
        } else if (role === 'cashier') {
          navigate('/cashier/pos');
        } else if (role === 'waiter') {
          navigate('/waiter/tables');
        } else if (role === 'kitchen') {
          navigate('/kitchen/orders');
        } else {
          navigate('/dashboard');
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err.response?.data?.error || t('loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-50 dark:bg-gray-50 dark:bg-gray-900 p-4 transition-colors duration-200">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-blue-600 mb-4 shadow-xl">
            <Store className="text-gray-900 dark:text-gray-900 dark:text-white" size={40} />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white">EthioPOS</h1>
          <p className="text-gray-600 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 mt-2">{t('restaurantManagementSystem')}</p>
        </div>

        <div className="bg-white dark:bg-white dark:bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700 p-6 shadow-xl transition-colors duration-200">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 dark:text-red-400 text-sm text-center">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300 mb-1">{t('emailAddress')}</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-500 dark:text-gray-400 dark:text-gray-500" size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-50 dark:bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 pl-10 text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
                  placeholder="admin@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300 mb-1">{t('password')}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-500 dark:text-gray-400 dark:text-gray-500" size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-50 dark:bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 pl-10 pr-12 text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-600 dark:text-gray-600 dark:text-gray-300"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-gray-900 dark:text-gray-900 dark:text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  {t('loggingIn')}
                </>
              ) : (
                t('signIn')
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-600 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 text-sm">
              {t('noAccount')}{' '}
              <Link to="/signup" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
                {t('signUp')}
              </Link>
            </p>
          </div>

          <div className="mt-6 text-center">
            <p className="text-gray-500 dark:text-gray-500 text-sm">{t('demoAccounts')}:</p>
            <p className="text-gray-600 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 text-xs mt-1">
              admin@example.com / admin123 ({t('admin')})<br />
              cashier@example.com / admin123 ({t('cashier')})<br />
              kitchen@example.com / admin123 ({t('kitchen')})
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;