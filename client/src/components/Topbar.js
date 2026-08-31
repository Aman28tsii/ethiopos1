// client/src/components/Topbar.js

import React, { useState } from 'react';
import { Bell, User, Search, Globe } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import RealTimeNotifications from './RealTimeNotifications';
import ThemeToggle from './ThemeToggle';
import BranchSelector from './BranchSelector';
import SyncStatusIndicator from './SyncStatusIndicator';

const Topbar = ({ user }) => {
  const { language, setLanguage, t } = useLanguage();
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  const languages = [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'am', name: 'አማርኛ', flag: '🇪🇹' }
  ];

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 sm:py-4 transition-colors duration-200">
      <div className="flex justify-between items-center">
        {/* Left Section - Welcome Message */}
        <div className="flex-1 min-w-0">
          <h2 className="text-base sm:text-xl font-semibold text-gray-900 dark:text-white truncate">
            {t('welcome')}, {user?.name?.split(' ')[0] || 'Staff'}!
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
            {t('readyToServe')}
          </p>
        </div>
        
        {/* Right Section */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Sync Status Indicator */}
          <SyncStatusIndicator />

          {/* Branch Selector - Only for owners/admins */}
          <BranchSelector />

          {/* Search Bar - Hidden on mobile */}
          <div className="hidden md:flex items-center bg-gray-100 dark:bg-gray-700 rounded-xl px-3 py-2">
            <Search size={18} className="text-gray-500 dark:text-gray-400" />
            <input
              type="text"
              placeholder={t('search')}
              className="bg-transparent border-none text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none px-2 w-48 lg:w-64"
            />
          </div>
          
          {/* Theme Toggle */}
          <ThemeToggle />
          
          {/* Language Switcher */}
          <div className="relative">
            <button
              onClick={() => setShowLanguageMenu(!showLanguageMenu)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-1"
            >
              <Globe size={20} className="text-gray-600 dark:text-gray-400" />
              <span className="text-gray-700 dark:text-gray-300 text-sm hidden sm:inline">
                {language === 'en' ? 'EN' : 'አማ'}
              </span>
            </button>
            
            {showLanguageMenu && (
              <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50">
                {languages.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setLanguage(lang.code);
                      setShowLanguageMenu(false);
                    }}
                    className={`w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition flex items-center gap-2 ${
                      language === lang.code 
                        ? 'bg-gray-100 dark:bg-gray-700 text-blue-600 dark:text-blue-400' 
                        : 'text-gray-900 dark:text-white'
                    }`}
                  >
                    <span>{lang.flag}</span>
                    <span>{lang.name}</span>
                    {language === lang.code && <span className="ml-auto">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Notifications */}
          <RealTimeNotifications />
          
          {/* User Menu */}
          <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-4 border-l border-gray-200 dark:border-gray-700">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
              <User size={16} className="text-gray-600 dark:text-gray-400 sm:w-5 sm:h-5" />
            </div>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{user?.name || 'Staff'}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                {t(user?.role) || user?.role || 'cashier'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;