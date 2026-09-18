import React, { useState, useEffect } from 'react';
import { Save, Building, Phone, Mail, Clock, Percent, Printer, Loader2, Globe, Moon, Sun, CheckCircle, Image as ImageIcon } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import API from '../../api/axios';

const Settings = () => {
  const { t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState({
    restaurantName: 'EthioPOS Restaurant',
    address: 'Addis Ababa, Ethiopia',
    phone: '+251-XXX-XXX-XXX',
    email: 'info@ethiopos.com',
    taxRate: 15,
    workingHours: '9:00 AM - 10:00 PM',
    receiptFooter: 'Thank you for dining with us!',
    logoUrl: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSaved(false);

    // Save local restaurant settings (unchanged behavior).
    localStorage.setItem('restaurantSettings', JSON.stringify(settings));

    // Persist the logo AND the name to the company record so the sidebar,
    // QR menu, browser tab and any other tenant surface pick them up.
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const companyId = user?.company_id;
      if (companyId) {
        const trimmedName = (settings.restaurantName || '').trim();
        const payload = {
          logo_url: settings.logoUrl && settings.logoUrl.trim() ? settings.logoUrl.trim() : null
        };
        if (trimmedName.length >= 2) {
          payload.name = trimmedName;
        }

        const resp = await API.put(`/companies/${companyId}/branding`, payload);
        const updatedCompany = resp?.data?.data?.company;

        // Update cached user so sidebar + title reflect the change
        // without requiring a re-login.
        const refreshed = {
          ...user,
          company_name: updatedCompany?.name ?? user.company_name,
          company_logo_url: updatedCompany?.logo_url ?? (settings.logoUrl || null)
        };
        localStorage.setItem('user', JSON.stringify(refreshed));

        // Also update the top-level title immediately.
        if (refreshed.company_name) {
          document.title = refreshed.company_name;
        }
      }
    } catch (err) {
      console.error('Branding update error:', err);
    } finally {
      setLoading(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  useEffect(() => {
    const savedSettings = localStorage.getItem('restaurantSettings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white">{t('settings')}</h1>
          <p className="text-gray-500 dark:text-gray-500 dark:text-gray-500 dark:text-gray-400 mt-1">{t('configureRestaurantPreferences')}</p>
        </div>
        <div className="flex gap-3">
          {/* Theme Toggle in Settings */}
          <button
            onClick={toggleTheme}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300 rounded-xl font-semibold flex items-center gap-2 transition"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            {theme === 'dark' ? t('lightMode') : t('darkMode')}
          </button>
          {saved && (
            <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-4 py-2 rounded-xl text-sm flex items-center gap-2">
              <CheckCircle size={16} />
              {t('settingsSavedSuccessfully')}
            </div>
          )}
        </div>
      </div>

      {/* Settings Form */}
      <form onSubmit={handleSubmit} className="bg-white dark:bg-white dark:bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
        <div className="p-6 space-y-6">
          {/* Restaurant Info Section */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Building size={20} className="text-blue-600 dark:text-blue-400" />
              {t('restaurantInformation')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300 mb-1">{t('restaurantName')}</label>
                <input
                  type="text"
                  name="restaurantName"
                  value={settings.restaurantName}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-50 dark:bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  This is the name shown in the sidebar, QR menu and browser tab.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300 mb-1">{t('address')}</label>
                <input
                  type="text"
                  name="address"
                  value={settings.address}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-50 dark:bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300 mb-1 flex items-center gap-2">
                  <Phone size={14} /> {t('phone')}
                </label>
                <input
                  type="text"
                  name="phone"
                  value={settings.phone}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-50 dark:bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300 mb-1 flex items-center gap-2">
                  <Mail size={14} /> {t('email')}
                </label>
                <input
                  type="email"
                  name="email"
                  value={settings.email}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-50 dark:bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300 mb-1 flex items-center gap-2">
                  <ImageIcon size={14} /> Restaurant Logo URL
                </label>
                <input
                  type="text"
                  name="logoUrl"
                  value={settings.logoUrl}
                  onChange={handleChange}
                  placeholder="https://example.com/logo.png"
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-50 dark:bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Paste a public image URL. Leave empty to show your restaurant name only.
                </p>
              </div>
            </div>
          </div>

          {/* Business Settings Section */}
          <div className="border-t border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700 pt-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Percent size={20} className="text-green-600 dark:text-green-400" />
              {t('businessSettings')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300 mb-1">{t('taxRate')} (%)</label>
                <input
                  type="number"
                  name="taxRate"
                  value={settings.taxRate}
                  onChange={handleChange}
                  step="0.5"
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-50 dark:bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300 mb-1 flex items-center gap-2">
                  <Clock size={14} /> {t('workingHours')}
                </label>
                <input
                  type="text"
                  name="workingHours"
                  value={settings.workingHours}
                  onChange={handleChange}
                  placeholder="9:00 AM - 10:00 PM"
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-50 dark:bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Receipt Settings Section */}
          <div className="border-t border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700 pt-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Printer size={20} className="text-purple-600 dark:text-purple-400" />
              {t('receiptSettings')}
            </h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-600 dark:text-gray-600 dark:text-gray-300 mb-1">{t('receiptFooter')}</label>
              <textarea
                name="receiptFooter"
                value={settings.receiptFooter}
                onChange={handleChange}
                rows="2"
                className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-50 dark:bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-900 dark:text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={t('thankYouForDining')}
              />
            </div>
          </div>

          {/* Save Button */}
          <div className="border-t border-gray-200 dark:border-gray-200 dark:border-gray-200 dark:border-gray-700 pt-6">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-gray-900 dark:text-gray-900 dark:text-white rounded-xl font-semibold transition flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {t('saveSettings')}
            </button>
          </div>
        </div>
      </form>

      {/* Info Card */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <p className="text-blue-700 dark:text-blue-400 text-sm flex items-center gap-2">
          <Globe size={16} />
          💡 {t('settingsSaveInfo')}
        </p>
      </div>
    </div>
  );
};

export default Settings;