import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';

import { LoginPage } from './pages/LoginPage';
import { RegisterShopPage } from './pages/RegisterShopPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { PendingApprovalPage } from './pages/PendingApprovalPage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { DashboardPage } from './pages/DashboardPage';
import { PartiesPage } from './pages/PartiesPage';
import { HistoryPage } from './pages/HistoryPage';
import { DuesPage } from './pages/DuesPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SettingsPage } from './pages/SettingsPage';

export const App: React.FC = () => {
  return (
    <HashRouter>
      <AuthProvider>
        <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
          <Navbar />
          <main className="flex-1">
            <Routes>
              {/* Public Auth Routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register-shop" element={<RegisterShopPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/admin-login" element={<AdminLoginPage />} />
              <Route path="/pending-approval" element={<PendingApprovalPage />} />

              {/* Admin Protected Routes */}
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminDashboardPage />} />
              </Route>

              {/* Merchant Protected Routes (Phase 2 Dashboard & Modules) */}
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/parties" element={<PartiesPage />} />
                <Route path="/ledger" element={<Navigate to="/history" replace />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/dues" element={<DuesPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/reports" element={<AnalyticsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </main>
        </div>
      </AuthProvider>
    </HashRouter>
  );
};
export default App;

