import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AdminLayout, AdminNavKey } from '../components/admin/AdminLayout';
import { AdminOverviewView } from '../components/admin/AdminOverviewView';
import { AdminShopsView } from '../components/admin/AdminShopsView';
import { AdminUsersView } from '../components/admin/AdminUsersView';
import { AdminHealthView } from '../components/admin/AdminHealthView';
import { AdminUsageView } from '../components/admin/AdminUsageView';
import { AdminAuditView } from '../components/admin/AdminAuditView';
import { AdminAnnouncementsView } from '../components/admin/AdminAnnouncementsView';
import { AdminSettingsView } from '../components/admin/AdminSettingsView';

export const AdminDashboardPage: React.FC = () => {
  const { user, adminRole, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AdminNavKey>('overview');
  const [openShopId, setOpenShopId] = useState<string | null>(null);
  const [shopInitialTab, setShopInitialTab] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'ALL'>('PENDING');

  const handleOpenShop = (shopId: string) => {
    setOpenShopId(shopId);
    setActiveTab('shops');
  };

  return (
    <AdminLayout
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      userEmail={user?.email ?? ''}
      adminRole={adminRole}
      onLogout={async () => {
        await logout();
        navigate('/admin-login');
      }}
      onOpenShop={handleOpenShop}
    >
      {activeTab === 'overview' && (
        <AdminOverviewView
          onGoPending={() => {
            setShopInitialTab('PENDING');
            setActiveTab('shops');
          }}
        />
      )}
      {activeTab === 'shops' && (
        <AdminShopsView
          adminRole={adminRole}
          initialTab={shopInitialTab}
          openShopId={openShopId}
          onClearOpenShop={() => setOpenShopId(null)}
        />
      )}
      {activeTab === 'users' && <AdminUsersView adminRole={adminRole} />}
      {activeTab === 'health' && <AdminHealthView />}
      {activeTab === 'usage' && <AdminUsageView adminRole={adminRole} />}
      {activeTab === 'audit' && <AdminAuditView />}
      {activeTab === 'announcements' && <AdminAnnouncementsView adminRole={adminRole} />}
      {activeTab === 'settings' && <AdminSettingsView adminRole={adminRole} />}
    </AdminLayout>
  );
};
