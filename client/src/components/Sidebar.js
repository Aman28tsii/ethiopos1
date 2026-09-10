// client/src/components/Sidebar.js

import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  ShoppingCart, Package, BarChart3, Users, LogOut, Store,
  ChevronLeft, ChevronRight, TrendingUp, Receipt, 
  ChefHat, Clock, LayoutDashboard, Settings, ClipboardList,
  Table as TableIcon, History, Menu, X, QrCode, Table,
  Utensils, Building2  // ADDED Building2
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const Sidebar = ({ user, onLogout }) => {
  const { t } = useLanguage();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const userRole = user?.role || 'cashier';

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setIsMobileOpen(false);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Owner menu items — ADDED Branch Management
  const ownerMenu = [
    { path: '/owner/dashboard', icon: LayoutDashboard, label: t('dashboard') },
    { path: '/owner/reports', icon: TrendingUp, label: t('profitReports') },
    { path: '/owner/expenses', icon: Receipt, label: t('expenses') },
    { path: '/owner/inventory', icon: Package, label: t('inventoryManagement') },
    { path: '/owner/staff', icon: Users, label: t('staffManagement') },
    { path: '/owner/customers', icon: Users, label: t('customers') },
    { path: '/owner/manage-tables', icon: Table, label: t('manageTables') },
    { path: '/owner/branches', icon: Building2, label: 'Branch Management' }, // ADDED
    { path: '/owner/print-qr', icon: QrCode, label: t('printQRCodes') },
    { path: '/owner/pending-approvals', icon: Clock, label: t('pendingApprovals') },
    { path: '/owner/settings', icon: Settings, label: t('settings') },
  ];

  // Manager menu items
  const managerMenu = [
    { path: '/manager/dashboard', icon: LayoutDashboard, label: t('dashboard') },
    { path: '/manager/inventory', icon: Package, label: t('inventoryManagement') },
    { path: '/manager/reports', icon: BarChart3, label: t('salesReports') },
    { path: '/manager/profit', icon: TrendingUp, label: t('profit') },
    { path: '/manager/tables', icon: Table, label: t('manageTables') },
  ];

  // Cashier menu items
  const cashierMenu = [
    { path: '/cashier/pos', icon: ShoppingCart, label: t('posTerminal') },
    { path: '/cashier/manual-order', icon: ShoppingCart, label: t('manualOrder') },
  ];

  // Waiter menu items
  const waiterMenu = [
    { path: '/waiter/tables', icon: TableIcon, label: t('tableManagement') },
    { path: '/waiter/my-orders', icon: ClipboardList, label: t('myOrders') },
    { path: '/waiter/pending-confirmations', icon: Clock, label: t('confirmOrders') },
    { path: '/waiter/table-status', icon: TableIcon, label: t('tableStatus') },
  ];

  // Kitchen menu items
  const kitchenMenu = [
    { path: '/kitchen/orders', icon: ChefHat, label: t('kitchenOrders') },
  ];

  // Order Taker menu
  const orderTakerMenu = [
    { path: '/order-taker', icon: Utensils, label: t('orderTaker') },
  ];

  const getMenuItems = () => {
    switch(userRole) {
      case 'owner':
      case 'admin':
        return ownerMenu;
      case 'manager':
        return managerMenu;
      case 'cashier':
        return cashierMenu;
      case 'waiter':
        return waiterMenu;
      case 'kitchen':
        return kitchenMenu;
      case 'order_taker':
        return orderTakerMenu;
      default:
        return cashierMenu;
    }
  };

  const menuItems = getMenuItems();

  const MobileOverlay = () => (
    isMobileOpen && (
      <div 
        className="fixed inset-0 bg-black/50 z-30 md:hidden"
        onClick={() => setIsMobileOpen(false)}
      />
    )
  );

  return (
    <>
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="fixed top-4 left-4 z-50 md:hidden bg-white dark:bg-gray-800 p-2 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 transition-colors duration-200"
      >
        {isMobileOpen ? <X size={24} className="text-gray-900 dark:text-white" /> : <Menu size={24} className="text-gray-900 dark:text-white" />}
      </button>

      <MobileOverlay />

      <aside 
        className={`
          fixed md:relative z-40 flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-300
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${isCollapsed && !isMobile ? 'w-20' : 'w-72'}
          ${isMobile ? 'w-72' : ''}
          h-full
        `}
      >
        <div className={`p-6 border-b border-gray-200 dark:border-gray-800 ${isCollapsed && !isMobile ? 'px-4' : ''}`}>
          <div className={`flex items-center ${isCollapsed && !isMobile ? 'justify-center' : 'gap-3'}`}>
            <Store className="text-blue-600 dark:text-blue-500 flex-shrink-0" size={32} />
            {(!isCollapsed || isMobile) && (
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">EthioPOS</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{t(userRole)}</p>
              </div>
            )}
          </div>
        </div>

        {!isMobile && (
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="absolute bg-gray-200 dark:bg-gray-800 rounded-full p-1 hover:bg-gray-300 dark:hover:bg-gray-700 transition-all duration-200 z-10"
            style={{ left: isCollapsed ? '5rem' : '18rem', top: '5rem' }}
          >
            {isCollapsed ? <ChevronRight size={16} className="text-gray-700 dark:text-gray-300" /> : <ChevronLeft size={16} className="text-gray-700 dark:text-gray-300" />}
          </button>
        )}

        <nav className="flex-1 p-4 space-y-2 mt-4 overflow-y-auto">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => isMobile && setIsMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center ${isCollapsed && !isMobile ? 'justify-center' : 'gap-3'} px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                }`
              }
              title={isCollapsed && !isMobile ? item.label : ''}
            >
              <item.icon size={20} />
              {(!isCollapsed || isMobile) && <span className="font-medium">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          {(!isCollapsed || isMobile) && (
            <div className="mb-3 px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl">
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('loggedInAs')}</p>
              <p className="text-gray-900 dark:text-white font-semibold truncate">{user?.name || t('staff')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{t(user?.role || 'cashier')}</p>
            </div>
          )}
          <button
            onClick={onLogout}
            className={`w-full flex items-center ${isCollapsed && !isMobile ? 'justify-center' : 'justify-center gap-2'} px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all duration-200 font-semibold`}
            title={isCollapsed && !isMobile ? t('logout') : ''}
          >
            <LogOut size={18} />
            {(!isCollapsed || isMobile) && <span>{t('logout')}</span>}
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;