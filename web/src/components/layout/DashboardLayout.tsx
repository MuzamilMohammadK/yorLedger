import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  History,
  Clock,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  ShieldCheck,
  Store,
  ChevronRight,
  Sparkles
} from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const { shop, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Parties', path: '/parties', icon: Users, badge: 'Suppliers & Buyers' },
    { name: 'Ledger Entry', path: '/ledger', icon: BookOpen },
    { name: 'History & Returns', path: '/history', icon: History },
    { name: 'Dues & Payments', path: '/dues', icon: Clock },
    { name: 'Reports & Analytics', path: '/analytics', icon: BarChart3 },
    { name: 'Settings', path: '/settings', icon: Settings }
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-800">
      {/* ----------------- Desktop Sidebar ----------------- */}
      <aside className="hidden md:flex md:w-64 lg:w-72 flex-col bg-slate-900 text-white border-r border-slate-800 shrink-0 select-none">
        {/* Brand / Logo */}
        <div className="p-6 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-purple-900/40 font-serif-display font-bold text-xl">
              SB
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-serif-display font-extrabold text-base tracking-tight text-white">
                  SB&A Ledger
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-semibold uppercase">
                  v2.0
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium tracking-wide">
                Silk Balance & Analysis
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Business Management
          </div>
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all group ${
                    isActive
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-950/40 font-bold'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                  }`
                }
              >
                <Icon className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-purple-400'}`} />
                <span className="flex-1">{item.name}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-purple-200" />}
              </NavLink>
            );
          })}
        </nav>

        {/* Shop Owner Profile Card */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
          <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex flex-col gap-2.5">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/30 font-bold text-xs">
                <Store className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate" title={shop?.name || 'Silk Merchant'}>
                  {shop?.name || 'Sri Lakshmi Silks'}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {shop?.owner_name || 'Proprietor'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-700/50 text-[10px]">
              <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                <ShieldCheck className="w-3 h-3" /> Approved
              </span>
              <span className="font-mono text-slate-400">
                GST {shop?.state_code || '37'}
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-xl transition-colors border border-rose-900/30"
          >
            <LogOut className="w-3.5 h-3.5" /> Log Out
          </button>
        </div>
      </aside>

      {/* ----------------- Mobile Header & Nav ----------------- */}
      <header className="md:hidden sticky top-0 z-30 bg-slate-900 text-white border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-200 hover:text-white"
            aria-label="Toggle Navigation"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="w-7 h-7 rounded-lg bg-purple-600 flex items-center justify-center font-serif-display font-bold text-xs text-white">
            SB
          </div>
          <span className="font-serif-display font-bold text-sm tracking-tight">
            {shop?.name || 'SB&A Ledger'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white relative"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          </button>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-72 bg-slate-900 text-white flex flex-col z-50 p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center font-bold text-white">
                  SB
                </div>
                <div>
                  <h3 className="font-serif-display font-bold text-sm text-white">SB&A Ledger</h3>
                  <p className="text-[10px] text-slate-400">Silk Balance & Analysis</p>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 py-4 space-y-1">
              {navItems.map(item => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                      isActive
                        ? 'bg-purple-600 text-white font-bold'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.name}</span>
                  </NavLink>
                );
              })}
            </nav>

            <div className="pt-4 border-t border-slate-800">
              <p className="text-xs font-bold text-white truncate">{shop?.name}</p>
              <p className="text-[11px] text-slate-400">{shop?.owner_name}</p>
              <button
                onClick={handleLogout}
                className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-rose-400 bg-rose-950/30 rounded-xl"
              >
                <LogOut className="w-3.5 h-3.5" /> Log Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- Main Content Pane ----------------- */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Desktop Top Header */}
        <header className="hidden md:flex h-16 bg-white border-b border-slate-200 px-8 items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="font-serif-display text-lg font-bold text-slate-900">
              {shop?.name || 'Silk Balance & Analysis'}
            </h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <ShieldCheck className="w-3 h-3 text-emerald-600" /> Verified Merchant
            </span>
            <span className="text-xs text-slate-400">
              GSTIN: <span className="font-mono font-medium text-slate-600">{shop?.gstin || '37AAACH7409R1ZZ'}</span>
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors relative"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white"></span>
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 z-50">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                    <span className="text-xs font-bold text-slate-900">Notifications</span>
                    <span className="text-[10px] text-purple-600 font-semibold cursor-pointer">Mark read</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-purple-50 text-purple-900 border border-purple-100">
                      <p className="font-semibold">Shop Verified</p>
                      <p className="text-[11px] text-purple-700 mt-0.5">Your application has been approved by administrator.</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 text-slate-700">
                      <p className="font-semibold">GST Compliance Active</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Default GST rate set to {((shop?.default_gst_bp || 500) / 100).toFixed(0)}%.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="h-6 w-px bg-slate-200" />

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                {(shop?.owner_name || 'Merchant').charAt(0).toUpperCase()}
              </div>
              <div className="text-left">
                <span className="block text-xs font-bold text-slate-900 leading-none">
                  {shop?.owner_name || 'Ramesh Kumar'}
                </span>
                <span className="text-[10px] text-slate-400">Proprietor</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
