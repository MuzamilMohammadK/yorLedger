import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Store,
  Users,
  Activity,
  Database,
  FileSearch,
  Megaphone,
  Settings,
  Bell,
  LogOut,
  Menu,
  X,
  ShieldCheck
} from 'lucide-react';
import { AdminRole } from '@yorbalance/shared';
import { adminApi, AdminAlertNotification } from '../../lib/adminApi';

export type AdminNavKey =
  | 'overview'
  | 'shops'
  | 'users'
  | 'health'
  | 'usage'
  | 'audit'
  | 'announcements'
  | 'settings';

const NAV_ITEMS: Array<{ key: AdminNavKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'shops', label: 'Shops', icon: Store },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'health', label: 'System health', icon: Activity },
  { key: 'usage', label: 'Data & usage', icon: Database },
  { key: 'audit', label: 'Audit log', icon: FileSearch },
  { key: 'announcements', label: 'Announcements', icon: Megaphone },
  { key: 'settings', label: 'Settings', icon: Settings }
];

const ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  support: 'Support',
  viewer: 'Viewer'
};

interface Props {
  activeTab: AdminNavKey;
  onSelectTab: (tab: AdminNavKey) => void;
  userEmail: string;
  adminRole: AdminRole | null;
  onLogout: () => void;
  onOpenShop?: (shopId: string) => void;
  children: React.ReactNode;
}

const NOTIF_LABEL: Record<string, string> = {
  SHOP_REGISTERED: 'New sign-up',
  SHOP_RESUBMITTED: 'Shop resubmitted',
  SERVICE_DOWN: 'Service down alert',
  QUOTA_WARNING: 'Quota warning (80%+)',
  BACKUP_FAILED: 'Backup failure'
};

export const AdminLayout: React.FC<Props> = ({
  activeTab,
  onSelectTab,
  userEmail,
  adminRole,
  onLogout,
  onOpenShop,
  children
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState<AdminAlertNotification[]>([]);

  useEffect(() => adminApi.watchNotifications(setNotifications), []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const navButtons = (
    <nav className="space-y-1 p-3">
      {NAV_ITEMS.map(item => {
        const Icon = item.icon;
        const active = activeTab === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              onSelectTab(item.key);
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              active
                ? 'bg-indigo-700 text-white shadow-sm'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sticky Sidebar */}
      <aside className="hidden md:flex md:flex-col w-60 shrink-0 bg-white border-r border-slate-200 sticky top-0 h-screen">
        <div className="h-16 px-4 border-b border-slate-200 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-700 text-white flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-base font-bold text-slate-900 block leading-tight">YorLedger</span>
            <span className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider">Admin Portal</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">{navButtons}</div>
        <div className="p-3 border-t border-slate-200 text-xs text-slate-500">
          <p className="font-semibold text-slate-700 truncate">{userEmail}</p>
          <p className="mt-0.5 text-[11px] font-bold uppercase text-indigo-700">
            {adminRole ? ROLE_LABEL[adminRole] : 'Admin'}
          </p>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-64 max-w-[80vw] bg-white h-full flex flex-col shadow-2xl">
            <div className="h-16 px-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-700" />
                <span className="font-bold text-slate-900">YorLedger Admin</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{navButtons}</div>
          </div>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Sticky Top Bar */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-slate-900">
              {NAV_ITEMS.find(n => n.key === activeTab)?.label ?? 'Admin'}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {adminRole && (
              <span className="hidden sm:inline-flex px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-800 text-xs font-bold">
                {ROLE_LABEL[adminRole]}
              </span>
            )}

            {/* Notification Bell Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setBellOpen(o => !o)}
                aria-label="Notifications"
                className="relative w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-700"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {bellOpen && (
                <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-2xl border border-slate-200 shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-slate-600">Alerts &amp; Sign-ups</span>
                    <button
                      type="button"
                      onClick={() => setBellOpen(false)}
                      className="text-xs text-slate-400 hover:text-slate-700"
                    >
                      Close
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <p className="p-6 text-center text-xs text-slate-500">
                        No alerts yet. New sign-ups, errors, quota warnings, and backup failures appear here.
                      </p>
                    ) : (
                      notifications.map(n => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            adminApi.markNotificationRead(n.id).catch(() => {});
                            setBellOpen(false);
                            if (n.shop_id && onOpenShop) onOpenShop(n.shop_id);
                          }}
                          className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                            n.read ? '' : 'bg-indigo-50/50'
                          }`}
                        >
                          <p className="text-xs font-bold text-slate-900">
                            {NOTIF_LABEL[n.kind] ?? n.kind}: {n.shop_name}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {n.created_at ? new Date(n.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="h-10 px-3 rounded-xl border border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-xs sm:text-sm font-semibold text-rose-700 inline-flex items-center gap-1.5"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
};
