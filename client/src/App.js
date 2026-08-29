// client/src/App.js

import React, { useState, useEffect, Suspense, lazy, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Signup from './pages/Signup';
import { LanguageProvider } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { BranchProvider } from './context/BranchContext'; // NEW
import ErrorBoundary from './components/ErrorBoundary';
import Categories from './pages/owner/Categories';

// Lazy load layouts
const OwnerLayout = lazy(() => import('./layouts/OwnerLayout'));
const ManagerLayout = lazy(() => import('./layouts/ManagerLayout'));
const CashierLayout = lazy(() => import('./layouts/CashierLayout'));
const WaiterLayout = lazy(() => import('./layouts/WaiterLayout'));
const KitchenLayout = lazy(() => import('./layouts/KitchenLayout'));

// Lazy load pages
const OwnerDashboard = lazy(() => import('./pages/owner/OwnerDashboard'));
const ManagerDashboard = lazy(() => import('./pages/manager/ManagerDashboard'));
const CashierPOS = lazy(() => import('./pages/cashier/CashierPOS'));
const TableGrid = lazy(() => import('./pages/waiter/TableGrid'));
const KitchenDashboard = lazy(() => import('./pages/kitchen/KitchenDashboard'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Expenses = lazy(() => import('./pages/Expenses'));
const ProfitReports = lazy(() => import('./pages/ProfitReports'));
const Staff = lazy(() => import('./pages/Staff'));
const PendingApprovals = lazy(() => import('./pages/PendingApprovals'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/owner/Settings'));
const QRMenu = lazy(() => import('./pages/QRMenu'));
const TrackOrder = lazy(() => import('./pages/TrackOrder'));
const Customers = lazy(() => import('./pages/Customers'));
const PrintQRCodes = lazy(() => import('./pages/owner/PrintQRCodes'));
const ManageTables = lazy(() => import('./pages/manager/ManageTables'));
const ManualOrder = lazy(() => import('./pages/cashier/ManualOrder'));
const MyOrders = lazy(() => import('./pages/waiter/MyOrders'));
const TableStatus = lazy(() => import('./pages/waiter/TableStatus'));
const PendingConfirmations = lazy(() => import('./pages/waiter/PendingConfirmations'));

// Loading component
const LoadingSpinner = () => (
  <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
  </div>
);

// Role-based route guard
const RoleRoute = React.memo(({ children, allowedRoles, userRole, redirectTo = '/login' }) => {
  if (!userRole) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(userRole)) {
    return <Navigate to={redirectTo} replace />;
  }
  return children;
});

// Get default route based on role
const getDefaultRoute = (role) => {
  switch(role) {
    case 'owner': return '/owner/dashboard';
    case 'admin': return '/owner/dashboard';
    case 'manager': return '/manager/dashboard';
    case 'cashier': return '/cashier/pos';
    case 'waiter': return '/waiter/tables';
    case 'kitchen': return '/kitchen/orders';
    default: return '/login';
  }
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (token && savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        setIsAuthenticated(true);
        setUser(userData);
      } catch (e) {
        console.error('Failed to parse user data');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const handleLogin = useCallback((userData, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setIsAuthenticated(true);
    setUser(userData);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('ethiopos_selected_branch'); // NEW
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  if (loading) {
    return <LoadingSpinner />;
  }

  // PUBLIC ROUTES
  if (!isAuthenticated) {
    return (
      <ErrorBoundary>
        <ThemeProvider>
          <LanguageProvider>
            <Router>
              <Suspense fallback={<LoadingSpinner />}>
                <Routes>
                  <Route path="/qr-menu" element={<QRMenu />} />
                  <Route path="/track-order" element={<TrackOrder />} />
                  <Route path="/login" element={<Login onLogin={handleLogin} />} />
                  <Route path="/signup" element={<Signup />} />
                  <Route path="*" element={<Navigate to="/login" />} />
                </Routes>
              </Suspense>
            </Router>
          </LanguageProvider>
        </ThemeProvider>
      </ErrorBoundary>
    );
  }

  const userRole = user?.role || 'cashier';

  // AUTHENTICATED ROUTES
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <LanguageProvider>
          <BranchProvider> {/* NEW */}
            <Router>
              <Suspense fallback={<LoadingSpinner />}>
                <Routes>
                  {/* Public routes also accessible to logged-in users */}
                  <Route path="/qr-menu" element={<QRMenu />} />
                  <Route path="/track-order" element={<TrackOrder />} />

                  {/* Owner Routes */}
                  <Route path="/owner/*" element={
                    <RoleRoute allowedRoles={['owner', 'admin']} userRole={userRole}>
                      <OwnerLayout user={user} onLogout={handleLogout}>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Routes>
                            <Route path="dashboard" element={<OwnerDashboard />} />
                            <Route path="reports" element={<ProfitReports />} />
                            <Route path="expenses" element={<Expenses />} />
                            <Route path="staff" element={<Staff />} />
                            <Route path="pending-approvals" element={<PendingApprovals />} />
                            <Route path="inventory" element={<Inventory />} />
                            <Route path="categories" element={<Categories />} />
                            <Route path="settings" element={<Settings />} />
                            <Route path="customers" element={<Customers />} />
                            <Route path="print-qr" element={<PrintQRCodes />} />
                            <Route path="manage-tables" element={<ManageTables />} />
                            <Route path="*" element={<Navigate to="/owner/dashboard" />} />
                          </Routes>
                        </Suspense>
                      </OwnerLayout>
                    </RoleRoute>
                  } />

                  {/* Manager Routes */}
                  <Route path="/manager/*" element={
                    <RoleRoute allowedRoles={['manager', 'owner', 'admin']} userRole={userRole}>
                      <ManagerLayout user={user} onLogout={handleLogout}>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Routes>
                            <Route path="dashboard" element={<ManagerDashboard />} />
                            <Route path="inventory" element={<Inventory />} />
                            <Route path="categories" element={<Categories />} />
                            <Route path="reports" element={<Reports />} />
                            <Route path="profit" element={<ProfitReports />} />
                            <Route path="tables" element={<ManageTables />} />
                            <Route path="*" element={<Navigate to="/manager/dashboard" />} />
                          </Routes>
                        </Suspense>
                      </ManagerLayout>
                    </RoleRoute>
                  } />

                  {/* Cashier Routes */}
                  <Route path="/cashier/*" element={
                    <RoleRoute allowedRoles={['cashier', 'manager', 'owner', 'admin']} userRole={userRole}>
                      <CashierLayout user={user} onLogout={handleLogout}>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Routes>
                            <Route path="pos" element={<CashierPOS userRole={userRole} />} />
                            <Route path="history" element={<div className="text-gray-900 dark:text-white p-6">Sales History</div>} />
                            <Route path="manual-order" element={<ManualOrder />} />
                            <Route path="*" element={<Navigate to="/cashier/pos" />} />
                          </Routes>
                        </Suspense>
                      </CashierLayout>
                    </RoleRoute>
                  } />

                  {/* Waiter Routes */}
                  <Route path="/waiter/*" element={
                    <RoleRoute allowedRoles={['waiter', 'cashier', 'manager', 'owner', 'admin']} userRole={userRole}>
                      <WaiterLayout user={user} onLogout={handleLogout}>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Routes>
                            <Route path="tables" element={<TableGrid />} />
                            <Route path="orders" element={<div className="text-gray-900 dark:text-white p-6">My Orders</div>} />
                            <Route path="my-orders" element={<MyOrders />} />
                            <Route path="table-status" element={<TableStatus />} />
                            <Route path="pending-confirmations" element={<PendingConfirmations />} />
                            <Route path="*" element={<Navigate to="/waiter/tables" />} />
                          </Routes>
                        </Suspense>
                      </WaiterLayout>
                    </RoleRoute>
                  } />

                  {/* Kitchen Routes */}
                  <Route path="/kitchen/*" element={
                    <RoleRoute allowedRoles={['kitchen', 'manager', 'owner', 'admin']} userRole={userRole}>
                      <KitchenLayout user={user} onLogout={handleLogout}>
                        <Suspense fallback={<LoadingSpinner />}>
                          <Routes>
                            <Route path="orders" element={<KitchenDashboard />} />
                            <Route path="*" element={<Navigate to="/kitchen/orders" />} />
                          </Routes>
                        </Suspense>
                      </KitchenLayout>
                    </RoleRoute>
                  } />

                  {/* Root redirect based on role */}
                  <Route path="/" element={<Navigate to={getDefaultRoute(userRole)} replace />} />
                  <Route path="*" element={<Navigate to={getDefaultRoute(userRole)} replace />} />
                </Routes>
              </Suspense>
            </Router>
          </BranchProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default React.memo(App);