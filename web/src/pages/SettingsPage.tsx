import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { useI18n, LANGUAGES, Lang } from '../i18n';
import { INDIAN_STATES } from '@yorbalance/shared';
import {
  ShopSettingsData,
  InvoiceSettings,
  NotificationSettings,
  AppPreferences
} from '@yorbalance/shared';
import {
  Store,
  FileSpreadsheet,
  Receipt,
  Bell,
  ShieldCheck,
  Sliders,
  Database,
  HelpCircle,
  Save,
  CheckCircle2,
  AlertTriangle,
  Download,
  LogOut,
  KeyRound,
  Info
} from 'lucide-react';

type SettingsTab =
  | 'profile'
  | 'gst'
  | 'invoice'
  | 'notifications'
  | 'account'
  | 'preferences'
  | 'backup'
  | 'about';

export const SettingsPage: React.FC = () => {
  const { shop, user, logout, sendResetEmail, refreshSession } = useAuth();
  const { lang, setLang } = useI18n();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states initialized
  const [profileForm, setProfileForm] = useState({
    name: '',
    owner_name: '',
    phone: '',
    email: '',
    address: '',
    state: 'Karnataka',
    state_code: '29',
    pin_code: '',
    logo_url: ''
  });

  const [gstForm, setGstForm] = useState({
    gst_status: 'REGISTERED' as 'REGISTERED' | 'UNREGISTERED' | 'COMPOSITION',
    gstin: '',
    legal_name: '',
    state_code: '29',
    default_gst_bp: 500
  });

  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings>({
    invoice_prefix: 'INV-',
    suggested_next_number: 1001,
    date_format: 'DD/MM/YYYY',
    show_logo: true,
    show_gstin: true,
    show_tax_breakdown: true,
    invoice_footer: 'Thank you for your patronage! Handloom silk sarees are guaranteed authentic.',
    terms_and_conditions: '1. No exchanges or returns after silk saree blouse fabric has been detached or altered.\n2. In case of manufacturing defect, report within 7 days with bill.\n3. All disputes subject to local jurisdiction.'
  });

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    push_notifications: true,
    in_app_notifications: true,
    due_reminders: true,
    reminder_lead_time_days: 3,
    daily_reminder_time: '08:00'
  });

  const [appPreferences, setAppPreferences] = useState<AppPreferences>({
    currency: 'INR',
    time_zone: 'Asia/Kolkata',
    date_format: 'DD/MM/YYYY',
    theme: 'light',
    language: 'en',
    default_landing_page: '/dashboard'
  });

  const [resetEmailSent, setResetEmailSent] = useState(false);

  // Load all settings from backend API
  const loadSettings = async () => {
    setLoading(true);
    try {
      const data: ShopSettingsData = await api.getShopSettings();
      if (data.shop) {
        setProfileForm({
          name: data.shop.name || '',
          owner_name: data.shop.owner_name || '',
          phone: data.shop.phone || '',
          email: data.shop.email || '',
          address: data.shop.address || '',
          state: data.shop.state || 'Karnataka',
          state_code: data.shop.state_code || '29',
          pin_code: data.shop.pin_code || '',
          logo_url: data.shop.logo_url || ''
        });

        setGstForm({
          gst_status: (data.shop.gstin ? 'REGISTERED' : 'UNREGISTERED') as any,
          gstin: data.shop.gstin || '',
          legal_name: data.shop.name || '',
          state_code: data.shop.state_code || '29',
          default_gst_bp: data.shop.default_gst_bp || 500
        });
      }

      if (data.invoice_settings) {
        setInvoiceSettings(data.invoice_settings);
      }
      if (data.notification_settings) {
        setNotificationSettings(data.notification_settings);
      }
      if (data.app_preferences) {
        setAppPreferences(data.app_preferences);
      }
    } catch (err: any) {
      console.error('Failed to load shop settings', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const triggerAlert = (msg: string, isError = false) => {
    if (isError) {
      setErrorMsg(msg);
      setSuccessMsg(null);
    } else {
      setSuccessMsg(msg);
      setErrorMsg(null);
    }
    setTimeout(() => {
      setSuccessMsg(null);
      setErrorMsg(null);
    }, 4500);
  };

  // Section 1: Save Shop Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileForm.name.trim()) return triggerAlert('Shop name is required', true);
    if (!profileForm.phone.trim()) return triggerAlert('Phone number is required', true);
    setSaving(true);
    try {
      await api.updateShopProfile(profileForm);
      await refreshSession();
      triggerAlert('Shop profile updated successfully!');
    } catch (err: any) {
      triggerAlert(err.message || 'Failed to update shop profile', true);
    } finally {
      setSaving(false);
    }
  };

  // Section 2: Save GST & Tax Settings
  const handleSaveGST = async (e: React.FormEvent) => {
    e.preventDefault();
    if (gstForm.gst_status === 'REGISTERED') {
      const gstinClean = gstForm.gstin.trim().toUpperCase();
      if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstinClean)) {
        return triggerAlert('Please enter a valid 15-character GSTIN (e.g. 29ABCDE1234F1Z5)', true);
      }
    }
    setSaving(true);
    try {
      await api.updateGSTSettings({
        gstin: gstForm.gst_status === 'REGISTERED' ? gstForm.gstin.trim().toUpperCase() : '',
        default_gst_bp: Number(gstForm.default_gst_bp),
        state_code: gstForm.state_code
      });
      await refreshSession();
      triggerAlert('GST & Tax settings updated! New rate will apply to newly created bills.');
    } catch (err: any) {
      triggerAlert(err.message || 'Failed to update GST settings', true);
    } finally {
      setSaving(false);
    }
  };

  // Section 3: Save Invoice Settings
  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateInvoiceSettings(invoiceSettings);
      triggerAlert('Invoice settings and branding saved successfully!');
    } catch (err: any) {
      triggerAlert(err.message || 'Failed to update invoice settings', true);
    } finally {
      setSaving(false);
    }
  };

  // Section 4: Save Notification Settings
  const handleSaveNotifications = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateNotificationSettings(notificationSettings);
      triggerAlert('Notification preferences saved! 08:00 IST reminder job preserved.');
    } catch (err: any) {
      triggerAlert(err.message || 'Failed to update notifications', true);
    } finally {
      setSaving(false);
    }
  };

  // Section 5: Password Reset
  const handlePasswordReset = async () => {
    if (!user?.email) return;
    try {
      await sendResetEmail(user.email);
      setResetEmailSent(true);
      triggerAlert(`Password reset link sent to ${user.email}`);
    } catch (err: any) {
      triggerAlert(err.message || 'Failed to send password reset email', true);
    }
  };

  // Section 6: Save App Preferences
  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateAppPreferences(appPreferences);
      triggerAlert('App display preferences saved!');
    } catch (err: any) {
      triggerAlert(err.message || 'Failed to update preferences', true);
    } finally {
      setSaving(false);
    }
  };

  // Section 7: Export CSV handler
  const handleDownloadCSV = async (type: 'transactions' | 'parties' | 'reports') => {
    try {
      const csv = await api.exportShopData(type);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yorledger_${type}_export_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      triggerAlert(`${type.toUpperCase()} data exported successfully!`);
    } catch (err: any) {
      triggerAlert('Failed to generate export file', true);
    }
  };

  const navSections = [
    { id: 'profile', name: '1. Shop Profile', icon: Store, desc: 'Contact details, address & branding' },
    { id: 'gst', name: '2. GST & Tax Settings', icon: FileSpreadsheet, desc: 'GSTIN, state code & default rates' },
    { id: 'invoice', name: '3. Invoice Settings', icon: Receipt, desc: 'Prefix, next bill # & T&C terms' },
    { id: 'notifications', name: '4. Notifications', icon: Bell, desc: 'Lead time reminders & 8 AM IST alerts' },
    { id: 'account', name: '5. Account & Security', icon: KeyRound, desc: 'Owner login, password & sessions' },
    { id: 'preferences', name: '6. App Preferences', icon: Sliders, desc: 'INR, Asia/Kolkata & landing page' },
    { id: 'backup', name: '7. Data & Backup', icon: Database, desc: 'Cloud SQL snapshots & CSV exports' },
    { id: 'about', name: '8. About YorLedger', icon: HelpCircle, desc: 'Version 1.0.0, support & terms' }
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold uppercase tracking-wider text-purple-600">
              System Configuration
            </span>
            <span className="px-2 py-0.5 rounded-full text-sm font-bold bg-purple-50 text-purple-700">
              YorLedger v1.0.0
            </span>
          </div>
          <h1 className="font-serif-display text-2xl font-bold text-slate-900 mt-1">
            Shop Settings & Configuration
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage your saree business profile, tax parameters, invoice formats, notifications, and automated backups.
          </p>
        </div>

        {/* Global Feedback Banners */}
        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl flex items-center gap-2.5 text-sm font-semibold shadow-xs animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-2xl flex items-center gap-2.5 text-sm font-semibold shadow-xs animate-in fade-in duration-200">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Settings Layout: Left Nav Tabs + Right Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* Section Selector Menu */}
          <div className="bg-white rounded-3xl p-3 border border-slate-200 shadow-xs space-y-1">
            {navSections.map(sec => {
              const Icon = sec.icon;
              const isActive = activeTab === sec.id;
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveTab(sec.id as SettingsTab)}
                  className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left transition-all ${
                    isActive
                      ? 'bg-purple-600 text-white font-bold shadow-md shadow-purple-950/20'
                      : 'text-slate-700 hover:bg-slate-50 font-medium'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm block truncate">{sec.name}</span>
                    <span className={`text-sm block truncate ${isActive ? 'text-purple-200' : 'text-slate-400'}`}>
                      {sec.desc}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Section Content Container */}
          <div className="lg:col-span-3 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs">
            {/* SECTION 1: Shop Profile */}
            {activeTab === 'profile' && (
              <form onSubmit={handleSaveProfile} className="space-y-6">
                <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-serif-display text-base font-bold text-slate-900">1. Shop Profile & Identity</h3>
                    <p className="text-sm text-slate-500">Business registration details, owner contact and official address.</p>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-semibold">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Verified: {shop?.status || 'APPROVED'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Shop / Business Name *</label>
                    <input
                      type="text"
                      value={profileForm.name}
                      onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Proprietor / Owner Name *</label>
                    <input
                      type="text"
                      value={profileForm.owner_name}
                      onChange={e => setProfileForm({ ...profileForm, owner_name: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Primary Mobile Number *</label>
                    <input
                      type="tel"
                      value={profileForm.phone}
                      onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Email Address</label>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={e => setProfileForm({ ...profileForm, email: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-700 font-semibold mb-1">Full Shop Address *</label>
                    <textarea
                      rows={2}
                      value={profileForm.address}
                      onChange={e => setProfileForm({ ...profileForm, address: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">State / Province *</label>
                    <select
                      value={profileForm.state_code}
                      onChange={e => {
                        const sel = INDIAN_STATES.find(s => s.code === e.target.value);
                        setProfileForm({
                          ...profileForm,
                          state_code: e.target.value,
                          state: sel?.name || profileForm.state
                        });
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm cursor-pointer"
                    >
                      {INDIAN_STATES.map(s => (
                        <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Postal PIN Code</label>
                    <input
                      type="text"
                      maxLength={6}
                      value={profileForm.pin_code}
                      onChange={e => setProfileForm({ ...profileForm, pin_code: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm font-mono"
                      placeholder="560002"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-700 font-semibold mb-1">Shop Logo URL</label>
                    <input
                      type="url"
                      value={profileForm.logo_url}
                      onChange={e => setProfileForm({ ...profileForm, logo_url: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm"
                      placeholder="https://example.com/logo.png"
                    />
                    <span className="text-sm text-slate-400 mt-1 block">
                      Displayed on PDF invoices, transaction receipts, and customer WhatsApp summaries.
                    </span>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm shadow-xs transition-colors disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{saving ? 'Saving...' : 'Save Profile Changes'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* SECTION 2: GST & Tax Settings */}
            {activeTab === 'gst' && (
              <form onSubmit={handleSaveGST} className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="font-serif-display text-base font-bold text-slate-900">2. GST & Tax Configurations</h3>
                  <p className="text-sm text-slate-500">Statutory tax identifier, registered state, and default billing GST rates.</p>
                </div>

                {/* Statutory Immutability Guarantee Notice */}
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-amber-900 text-sm">
                  <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <strong className="block text-amber-950 font-semibold mb-0.5">
                      Statutory Historical Tax Immutability Rule:
                    </strong>
                    Changing the default GST rate below applies <strong>ONLY to newly created bills and transactions</strong>.
                    Past recorded bills preserve their exact historical tax snapshot (CGST/SGST/IGST paise) and will never be recalculated or altered.
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">GST Registration Type</label>
                    <select
                      value={gstForm.gst_status}
                      onChange={e => setGstForm({ ...gstForm, gst_status: e.target.value as any })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm cursor-pointer font-medium"
                    >
                      <option value="REGISTERED">Regular GST Registered (Eligible for ITC)</option>
                      <option value="COMPOSITION">Composition Scheme Dealer (CMP-08)</option>
                      <option value="UNREGISTERED">Unregistered Retailer (Under ₹40 Lakhs)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">GSTIN Identifier (15 Characters)</label>
                    <input
                      type="text"
                      maxLength={15}
                      value={gstForm.gstin}
                      onChange={e => setGstForm({ ...gstForm, gstin: e.target.value.toUpperCase() })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm font-mono uppercase"
                      placeholder="29ABCDE1234F1Z5"
                      disabled={gstForm.gst_status === 'UNREGISTERED'}
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Default GST Rate for New Saree Items</label>
                    <select
                      value={gstForm.default_gst_bp}
                      onChange={e => setGstForm({ ...gstForm, default_gst_bp: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm cursor-pointer font-semibold"
                    >
                      <option value={500}>5% GST (Standard Silk Sarees & Handlooms)</option>
                      <option value={1200}>12% GST (High-Value Silk & Embroidery Job-Work)</option>
                      <option value={1800}>18% GST (Synthetic Silk & Tailoring Accessories)</option>
                      <option value={0}>0% GST (Exempt Khadi & Raw Cocoons)</option>
                    </select>
                    <span className="text-sm text-slate-400 mt-1 block">
                      Stored in basis points: {gstForm.default_gst_bp} bp = {(gstForm.default_gst_bp / 100).toFixed(1)}%
                    </span>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">State Code (POS Baseline)</label>
                    <input
                      type="text"
                      value={gstForm.state_code}
                      readOnly
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-600 text-sm font-mono cursor-not-allowed"
                    />
                    <span className="text-sm text-slate-400 mt-1 block">
                      Determines Intra-State (CGST+SGST) vs Inter-State (IGST) split.
                    </span>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm shadow-xs transition-colors disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{saving ? 'Saving...' : 'Update Tax Preferences'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* SECTION 3: Invoice Settings */}
            {activeTab === 'invoice' && (
              <form onSubmit={handleSaveInvoice} className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="font-serif-display text-base font-bold text-slate-900">3. Invoice Branding & Formatting</h3>
                  <p className="text-sm text-slate-500">Configure sequential billing numbers, tax breakdown display, and terms.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Invoice Prefix</label>
                    <input
                      type="text"
                      value={invoiceSettings.invoice_prefix}
                      onChange={e => setInvoiceSettings({ ...invoiceSettings, invoice_prefix: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm font-mono"
                      placeholder="INV-"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Suggested Next Invoice #</label>
                    <input
                      type="number"
                      value={invoiceSettings.suggested_next_number}
                      onChange={e => setInvoiceSettings({ ...invoiceSettings, suggested_next_number: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Invoice Date Format</label>
                    <select
                      value={invoiceSettings.date_format}
                      onChange={e => setInvoiceSettings({ ...invoiceSettings, date_format: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm cursor-pointer font-medium"
                    >
                      <option value="DD/MM/YYYY">DD/MM/YYYY (Indian Standard)</option>
                      <option value="DD-MMM-YYYY">DD-MMM-YYYY (e.g. 05-Nov-2026)</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
                    </select>
                  </div>
                </div>

                {/* Display Toggles */}
                <div className="space-y-3 pt-2">
                  <span className="text-sm font-bold text-slate-800 block">Bill Display Preferences</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="flex items-center gap-2.5 p-3 rounded-2xl border border-slate-200 bg-slate-50 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={invoiceSettings.show_logo}
                        onChange={e => setInvoiceSettings({ ...invoiceSettings, show_logo: e.target.checked })}
                        className="rounded text-purple-600 focus:ring-purple-500"
                      />
                      <span className="font-medium text-slate-800">Print Shop Logo</span>
                    </label>

                    <label className="flex items-center gap-2.5 p-3 rounded-2xl border border-slate-200 bg-slate-50 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={invoiceSettings.show_gstin}
                        onChange={e => setInvoiceSettings({ ...invoiceSettings, show_gstin: e.target.checked })}
                        className="rounded text-purple-600 focus:ring-purple-500"
                      />
                      <span className="font-medium text-slate-800">Print GSTIN Header</span>
                    </label>

                    <label className="flex items-center gap-2.5 p-3 rounded-2xl border border-slate-200 bg-slate-50 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={invoiceSettings.show_tax_breakdown}
                        onChange={e => setInvoiceSettings({ ...invoiceSettings, show_tax_breakdown: e.target.checked })}
                        className="rounded text-purple-600 focus:ring-purple-500"
                      />
                      <span className="font-medium text-slate-800">Show Tax Breakdown</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-4 pt-2 text-sm">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Invoice Footer Greeting</label>
                    <input
                      type="text"
                      value={invoiceSettings.invoice_footer}
                      onChange={e => setInvoiceSettings({ ...invoiceSettings, invoice_footer: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Standard Terms & Conditions</label>
                    <textarea
                      rows={3}
                      value={invoiceSettings.terms_and_conditions}
                      onChange={e => setInvoiceSettings({ ...invoiceSettings, terms_and_conditions: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm leading-relaxed"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm shadow-xs transition-colors disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{saving ? 'Saving...' : 'Save Invoice Formatting'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* SECTION 4: Notification Settings */}
            {activeTab === 'notifications' && (
              <form onSubmit={handleSaveNotifications} className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="font-serif-display text-base font-bold text-slate-900">4. Notification & Due Reminders</h3>
                  <p className="text-sm text-slate-500">Configure reminder lead times, in-app notifications and morning dispatch schedule.</p>
                </div>

                {/* 08:00 AM IST Cron Notice */}
                <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex items-start gap-3 text-purple-900 text-sm">
                  <Bell className="w-4 h-4 text-purple-700 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <strong className="block text-purple-950 font-semibold mb-0.5">
                      Scheduled Daily 08:00 AM IST Due Dispatch:
                    </strong>
                    YorLedger runs an automated morning reminder engine at exactly 08:00 AM IST (Asia/Kolkata).
                    Pending customer dues and supplier payables matching your lead time threshold are compiled for dispatch.
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <label className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200 bg-slate-50 cursor-pointer text-sm">
                    <div>
                      <span className="font-semibold text-slate-900 block">Enable Automated Due Date Reminders</span>
                      <span className="text-sm text-slate-500">Trigger alerts before customer credit bills mature</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationSettings.due_reminders}
                      onChange={e => setNotificationSettings({ ...notificationSettings, due_reminders: e.target.checked })}
                      className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200 bg-slate-50 cursor-pointer text-sm">
                    <div>
                      <span className="font-semibold text-slate-900 block">In-App Notification Center Badge</span>
                      <span className="text-sm text-slate-500">Display unread badge alerts in navigation header</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationSettings.in_app_notifications}
                      onChange={e => setNotificationSettings({ ...notificationSettings, in_app_notifications: e.target.checked })}
                      className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200 bg-slate-50 cursor-pointer text-sm">
                    <div>
                      <span className="font-semibold text-slate-900 block">Web Push Notifications</span>
                      <span className="text-sm text-slate-500">Receive desktop alerts when payment receipts are logged</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationSettings.push_notifications}
                      onChange={e => setNotificationSettings({ ...notificationSettings, push_notifications: e.target.checked })}
                      className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
                    />
                  </label>
                </div>

                <div className="pt-2 text-sm">
                  <label className="block text-slate-700 font-semibold mb-1">Reminder Lead Time (Notice Prior to Due Date)</label>
                  <select
                    value={notificationSettings.reminder_lead_time_days}
                    onChange={e => setNotificationSettings({ ...notificationSettings, reminder_lead_time_days: Number(e.target.value) as any })}
                    className="w-full sm:w-64 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm cursor-pointer font-semibold"
                  >
                    <option value={0}>On the Due Date (0 days before)</option>
                    <option value={1}>1 Day Before Maturity</option>
                    <option value={3}>3 Days Before Maturity (Recommended)</option>
                    <option value={7}>7 Days Before Maturity (1 Week Advance)</option>
                  </select>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm shadow-xs transition-colors disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{saving ? 'Saving...' : 'Save Notification Preferences'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* SECTION 5: Account & Security */}
            {activeTab === 'account' && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="font-serif-display text-base font-bold text-slate-900">5. Account & Security</h3>
                  <p className="text-sm text-slate-500">Firebase Authentication credentials, password recovery and session termination.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-400 font-semibold block text-sm uppercase">Registered Owner Email</span>
                    <strong className="text-slate-900 font-medium text-sm block mt-0.5">{user?.email || 'N/A'}</strong>
                    <span className="text-slate-500 text-sm">Primary authentication ID</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-400 font-semibold block text-sm uppercase">Assigned User Role</span>
                    <strong className="text-purple-700 font-bold text-sm block mt-0.5">{user?.role || 'SHOP_OWNER'}</strong>
                    <span className="text-slate-500 text-sm">Full Tenant Administration Rights</span>
                  </div>
                </div>

                {/* Password Reset Section */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="font-semibold text-sm text-slate-900">Reset Account Password</h4>
                      <p className="text-sm text-slate-500 mt-0.5">
                        A secure password reset verification link will be sent to your registered email via Firebase Auth.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handlePasswordReset}
                      className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 font-semibold text-sm transition-colors shrink-0 shadow-xs"
                    >
                      Send Reset Link
                    </button>
                  </div>
                  {resetEmailSent && (
                    <div className="text-sm text-emerald-700 font-medium flex items-center gap-1.5 pt-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Check your inbox for the password reset instructions.
                    </div>
                  )}
                </div>

                {/* Sign-Out Action */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-slate-800 block">Sign Out of Session</span>
                    <span className="text-sm text-slate-400">Terminates active browser authentication tokens</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await logout();
                      window.location.href = '/login';
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-sm transition-colors border border-rose-200"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            )}

            {/* SECTION 6: App Preferences */}
            {activeTab === 'preferences' && (
              <form onSubmit={handleSavePreferences} className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="font-serif-display text-base font-bold text-slate-900">6. Display & Regional Preferences</h3>
                  <p className="text-sm text-slate-500">Formatting standards, retail counter theme, and default starting screen.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Standard Operating Currency</label>
                    <input
                      type="text"
                      value="INR (₹) – Indian Rupee (Stored in Integer Paise)"
                      readOnly
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-600 text-sm cursor-not-allowed font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Business Time Zone</label>
                    <input
                      type="text"
                      value="Asia/Kolkata (IST, UTC +05:30)"
                      readOnly
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-600 text-sm cursor-not-allowed font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Default Landing Screen Upon Sign-In</label>
                    <select
                      value={appPreferences.default_landing_page}
                      onChange={e => setAppPreferences({ ...appPreferences, default_landing_page: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm cursor-pointer font-medium"
                    >
                      <option value="/dashboard">Overview Dashboard</option>
                                            <option value="/dues">Dues & Collections</option>
                      <option value="/analytics">Reports & GST Analytics</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Interface Language</label>
                    <select
                      value={lang}
                      onChange={e => { setLang(e.target.value as Lang); setAppPreferences({ ...appPreferences, language: e.target.value }); }}
                      className="w-full h-12 px-3.5 rounded-xl border-2 border-slate-200 bg-white focus:outline-none focus:border-indigo-600 text-base cursor-pointer font-medium"
                    >
                      {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm shadow-xs transition-colors disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{saving ? 'Saving...' : 'Save App Preferences'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* SECTION 7: Data & Backup */}
            {activeTab === 'backup' && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="font-serif-display text-base font-bold text-slate-900">7. Data Ownership & Backup</h3>
                  <p className="text-sm text-slate-500">Download complete CSV backups and review automated Cloud SQL disaster recovery.</p>
                </div>

                {/* Cloud SQL Snapshot Active Badge */}
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-sm font-bold text-emerald-950 block">Automated Cloud SQL Backup: Active</strong>
                    <p className="text-sm text-emerald-800 mt-0.5 leading-relaxed">
                      Daily automated point-in-time recovery (PITR) snapshots are managed on Google Cloud SQL with a 30-day retention policy.
                      Multi-tenant isolation enforces strict partition security by your shop ID.
                    </p>
                  </div>
                </div>

                {/* One-Click CSV Downloads */}
                <div className="space-y-3 pt-2">
                  <span className="text-sm font-bold text-slate-900 block">Export Your Ledger Data (CSV Format)</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between space-y-3">
                      <div>
                        <span className="font-semibold text-sm text-slate-900 block">Transaction Ledger</span>
                        <span className="text-sm text-slate-500 mt-0.5 block">
                          All recorded sales, purchases, job work and payment vouchers.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownloadCSV('transactions')}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-800 text-sm font-semibold hover:bg-slate-100 transition-colors shadow-xs"
                      >
                        <Download className="w-3.5 h-3.5 text-slate-500" />
                        <span>Download CSV</span>
                      </button>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between space-y-3">
                      <div>
                        <span className="font-semibold text-sm text-slate-900 block">Party Directory</span>
                        <span className="text-sm text-slate-500 mt-0.5 block">
                          Customers, suppliers, and artisan contacts with balances.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownloadCSV('parties')}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-800 text-sm font-semibold hover:bg-slate-100 transition-colors shadow-xs"
                      >
                        <Download className="w-3.5 h-3.5 text-slate-500" />
                        <span>Download CSV</span>
                      </button>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between space-y-3">
                      <div>
                        <span className="font-semibold text-sm text-slate-900 block">GST Summary Register</span>
                        <span className="text-sm text-slate-500 mt-0.5 block">
                          Itemized tax heads, eligible ITC and reconciliation data.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownloadCSV('reports')}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-800 text-sm font-semibold hover:bg-slate-100 transition-colors shadow-xs"
                      >
                        <Download className="w-3.5 h-3.5 text-slate-500" />
                        <span>Download CSV</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 8: About YorLedger */}
            {activeTab === 'about' && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="font-serif-display text-base font-bold text-slate-900">8. About YorLedger & Compliance</h3>
                  <p className="text-sm text-slate-500">Application build metadata, developer information, terms and support.</p>
                </div>

                <div className="flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-purple-900 to-slate-900 text-white shadow-sm">
                  <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center font-serif-display font-bold text-xl text-amber-300">
                    SB
                  </div>
                  <div>
                    <h4 className="font-serif-display text-base font-bold">YorLedger</h4>
                    <p className="text-sm text-purple-200">
                      Version 1.0.0 Production Build (Build ID: 2026.11.05-REL)
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                    <span className="font-semibold text-slate-900 block">Design & Engineering</span>
                    <p className="text-slate-600 text-sm leading-relaxed">
                      Custom-engineered for wholesale saree distributors, retail silk showrooms, handloom cooperatives, and artisan job-work units.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                    <span className="font-semibold text-slate-900 block">Help & Support Desk</span>
                    <p className="text-slate-600 text-sm leading-relaxed">
                      Technical support: <span className="font-mono text-purple-700">support@yorbalance.in</span>
                      <br />
                      Helpline: +91 98450 12345 (10:00 AM – 7:00 PM IST)
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-2 text-sm text-slate-500">
                  <div className="flex flex-wrap gap-4 font-semibold text-purple-700">
                    <a href="#terms" onClick={e => { e.preventDefault(); alert('Terms of Service: YorLedger software is provided for business accounting record keeping in compliance with Indian GST regulations.'); }} className="hover:underline">
                      Terms of Service
                    </a>
                    <span>•</span>
                    <a href="#privacy" onClick={e => { e.preventDefault(); alert('Privacy Policy: All shop records, invoices and party information are encrypted and isolated strictly to your shop account.'); }} className="hover:underline">
                      Privacy Policy
                    </a>
                    <span>•</span>
                    <a href="#faq" onClick={e => { e.preventDefault(); alert('FAQ: For any GST reconciliation or return filing inquiries, consult your licensed Chartered Accountant.'); }} className="hover:underline">
                      Statutory GST Notice
                    </a>
                  </div>
                  <p className="text-sm text-slate-400">
                    © 2026 YorLedger
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};
