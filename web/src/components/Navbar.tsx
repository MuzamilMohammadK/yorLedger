import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Badge } from './ui/Badge';
import { LogOut, Store, ShieldCheck, Sparkles } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, shop, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isDashboardRoute = [
    '/dashboard',
    '/parties',
    '/ledger',
    '/history',
    '/dues',
    '/analytics',
    '/settings'
  ].some(p => location.pathname === p || location.pathname.startsWith(`${p}/`));

  if (isDashboardRoute && shop?.status === 'APPROVED') {
    return null;
  }

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-brand-900 flex items-center justify-center text-amber-400 shadow-md shadow-brand-950/20 group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="font-serif-display text-xl font-bold tracking-tight text-brand-950 block leading-tight">
                YorBalance
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 block">
                Saree & Silk Ledger
              </span>
            </div>
          </Link>

          {/* Right section */}
          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-3">
                {isAdmin ? (
                  <div className="flex items-center gap-2 px-3 py-1 bg-purple-50 rounded-lg border border-purple-200 text-purple-900 text-xs font-semibold">
                    <ShieldCheck className="w-4 h-4 text-purple-600" />
                    <span>Admin Portal</span>
                  </div>
                ) : (
                  shop && (
                    <div className="hidden sm:flex flex-col items-end">
                      <div className="flex items-center gap-2">
                        <Store className="w-3.5 h-3.5 text-brand-900" />
                        <span className="text-sm font-bold text-slate-900">{shop.name}</span>
                        <Badge status={shop.status} />
                      </div>
                      <span className="text-xs text-slate-500">{shop.owner_name} • GSTIN: {shop.gstin}</span>
                    </div>
                  )
                )}

                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-600 hover:text-rose-700 hover:bg-rose-50 transition-colors text-xs font-medium"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            )}

            {!user && (
              <div className="flex items-center gap-2">
                <Link
                  to="/admin-login"
                  className="text-xs font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5"
                >
                  Admin Portal
                </Link>
                <Link
                  to="/login"
                  className="text-xs font-semibold bg-brand-900 text-white px-3.5 py-1.5 rounded-lg hover:bg-brand-950 transition-colors"
                >
                  Merchant Sign In
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

