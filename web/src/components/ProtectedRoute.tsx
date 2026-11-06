import React from 'react';
import { Navigate } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { useAuth } from '../context/AuthContext';

export const ProtectedRoute: React.FC = () => {
  const { user, shop, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-brand-900 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs uppercase tracking-widest text-slate-500 font-semibold">
            Authenticating Session...
          </span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  if (!shop || shop.status !== 'APPROVED') {
    return <Navigate to="/pending-approval" replace />;
  }

  return <AppShell />;
};

