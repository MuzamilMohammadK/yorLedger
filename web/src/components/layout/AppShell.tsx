import React, { createContext, useContext, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, Users, Plus, Wallet, Menu, ScrollText, BarChart3, Settings, LogOut, Bell, Languages, BookOpen, Boxes, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { BillKind, Party, AdminAnnouncementConfig, formatPaiseToINR } from '@yorbalance/shared';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { todayIST } from '../../lib/data/util';
import { useAuth } from '../../context/AuthContext';
import { useI18n, LANGUAGES } from '../../i18n';
import { api } from '../../lib/api';
import { useAlerts, useLive } from '../../lib/useLiveData';
import { NewTransactionModal, DraftBill, Sheet } from '../ledger/NewTransactionModal';
import { RecordPaymentModal } from '../dues/RecordPaymentModal';
import { ScanBillSheet } from '../scan/ScanBillSheet';
import { startReminders } from '../../lib/reminders';
import { isAndroidApp } from '../../lib/platform';

interface ShellApi {
  openNewBill: (opts?: { partyId?: string; kind?: BillKind; draft?: Partial<DraftBill> }) => void;
  openPayment: (billId: string) => void;
  openScan: () => void;
}
const ShellContext = createContext<ShellApi | null>(null);
export const useShell = () => {
  const c = useContext(ShellContext);
  if (!c) throw new Error('useShell outside AppShell');
  return c;
};

// §5 primary navigation, in the document's order.
const NAV = [
  { to: '/dashboard', key: 'nav_home', icon: Home },
  { to: '/parties', key: 'nav_parties', icon: Users },
  { to: '/ledger', key: 'nav_ledger', icon: BookOpen },
  { to: '/history', key: 'nav_history', icon: ScrollText },
  { to: '/dues', key: 'nav_dues', icon: Wallet },
  { to: '/stock', key: 'nav_stock', icon: Boxes },
  { to: '/reports', key: 'nav_reports', icon: BarChart3 },
  { to: '/settings', key: 'nav_settings', icon: Settings }
] as const;
// Phone bottom bar: Dashboard, Parties, Ledger (centre), Dues, More (History, Stock, Reports, Settings).
const BOTTOM_LEFT = [NAV[0], NAV[1]];
const BOTTOM_RIGHT = NAV[4];
const EXTRA = [NAV[3], NAV[5], NAV[6], NAV[7]];

/** Frame for every signed-in, approved shop screen. */
export const AppShell: React.FC = () => {
  const { shop, logout, isApproved } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isInnerScrollPage = ['/history', '/ledger', '/dues', '/settings'].some(p => pathname.startsWith(p));
  const [billOpen, setBillOpen] = useState(false);
  const [billOpts, setBillOpts] = useState<{ partyId?: string; draft?: Partial<DraftBill> | null }>({});
  const [payBill, setPayBill] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [announcement, setAnnouncement] = useState<AdminAnnouncementConfig | null>(null);
  const { data: partyData } = useLive(() => api.getParties(), []);

  useEffect(() => {
    return onSnapshot(
      doc(db, 'systemConfig', 'announcements'),
      snap => setAnnouncement(snap.exists() ? (snap.data() as AdminAnnouncementConfig) : null),
      () => setAnnouncement(null)
    );
  }, []);
  const parties: Party[] = partyData?.parties ?? [];
  const { alerts, unread, markRead } = useAlerts(isApproved);

  // Due reminders as phone / desktop notifications, in the chosen language.
  useEffect(() => (isApproved ? startReminders(t) : undefined), [isApproved, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tapping a reminder on Android opens that bill.
  useEffect(() => {
    if (!isAndroidApp) return;
    let remove: (() => void) | undefined;
    import('@capacitor/local-notifications').then(({ LocalNotifications }) =>
      LocalNotifications.addListener('localNotificationActionPerformed', a => {
        const id = a.notification.extra?.billId;
        if (id) navigate(`/history?bill=${id}`);
      }).then(h => { remove = () => h.remove(); })
    );
    return () => remove?.();
  }, [navigate]);

  const shell: ShellApi = {
    openNewBill: (o = {}) => {
      setBillOpts({ partyId: o.partyId, draft: o.draft ?? (o.kind ? { kind: o.kind } : null) });
      setBillOpen(true);
    },
    openPayment: id => setPayBill(id),
    openScan: () => { setBillOpen(false); setScanOpen(true); }
  };

  const rs = (p: number) => formatPaiseToINR(p, true);
  const navCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'gap-2.5 px-3'} h-10 rounded-xl text-sm font-semibold transition-colors ${isActive ? 'bg-indigo-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`;

  const doLogout = async () => {
    await logout();
    navigate('/login');
  };

  const langPicker = (
    <div className="grid grid-cols-2 gap-2">
      {LANGUAGES.map(l => (
        <button key={l.code} onClick={() => setLang(l.code)}
          className={`h-12 rounded-xl border-2 text-base font-semibold ${lang === l.code ? 'border-indigo-600 bg-indigo-50 text-indigo-900' : 'border-slate-200 text-slate-700'}`}>
          {l.label}
        </button>
      ))}
    </div>
  );

  return (
    <ShellContext.Provider value={shell}>
      <div className="h-[100dvh] overflow-hidden bg-slate-50 md:flex">
        {/* Desktop sidebar (220px, constant, collapsible to icon strip) */}
        <aside className={`hidden md:flex ${sidebarCollapsed ? 'md:w-[68px] px-2' : 'md:w-[220px] px-3'} shrink-0 flex-col gap-1.5 border-r border-slate-200 bg-white py-3 h-full transition-all`}>
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between px-1'} pb-2`}>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <p className="text-lg font-extrabold text-indigo-800 leading-tight truncate">YorLedger</p>
                <p className="text-xs text-slate-500 truncate">{shop?.name}</p>
              </div>
            )}
            <button
              type="button"
              onClick={() => setSidebarCollapsed(c => !c)}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center shrink-0"
            >
              {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          </div>
          <button onClick={() => shell.openNewBill()}
            title={t('nav_new_bill')}
            className={`h-11 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-bold flex items-center justify-center gap-1.5 mb-1 ${sidebarCollapsed ? 'px-0' : 'px-3'}`}>
            <Plus className="w-5 h-5 shrink-0" />{!sidebarCollapsed && <span>{t('nav_new_bill')}</span>}
          </button>
          {NAV.map(({ to, key, icon: Icon }) => (
            <NavLink key={to} to={to} title={t(key)} className={navCls}>
              <Icon className="w-4 h-4 shrink-0" />{!sidebarCollapsed && <span className="truncate">{t(key)}</span>}
            </NavLink>
          ))}
          <div className="mt-auto space-y-2 pt-2 border-t border-slate-100">
            {!sidebarCollapsed ? (
              <label className="flex items-center gap-2 px-1 text-xs font-semibold text-slate-600">
                <Languages className="w-4 h-4 shrink-0 text-slate-400" />
                <select
                  aria-label={t('language')}
                  value={lang}
                  onChange={e => setLang(e.target.value as any)}
                  className="flex-1 h-9 px-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:border-indigo-600 focus:outline-none"
                >
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </label>
            ) : (
              <button
                type="button"
                title={t('language')}
                onClick={() => setSidebarCollapsed(false)}
                className="w-full h-9 rounded-lg hover:bg-slate-100 text-slate-600 flex items-center justify-center"
              >
                <Languages className="w-4 h-4" />
              </button>
            )}
            <button onClick={doLogout} title={t('logout')} className={`w-full h-10 rounded-xl border border-slate-200 text-xs font-semibold text-rose-700 hover:bg-rose-50 flex items-center justify-center ${sidebarCollapsed ? '' : 'gap-2'}`}>
              <LogOut className="w-4 h-4 shrink-0" />{!sidebarCollapsed && <span>{t('logout')}</span>}
            </button>
          </div>
        </aside>

        <div className="flex-1 min-w-0 min-h-0 h-full flex flex-col">
          {/* Top bar (constant) */}
          <header className="z-30 shrink-0 bg-white border-b border-slate-200 h-16 px-4 flex items-center justify-between">
            <div className="min-w-0">
              <p className="md:hidden text-lg font-extrabold text-indigo-800 leading-tight">YorLedger</p>
              <p className="text-sm md:text-base text-slate-600 truncate">{shop?.name}</p>
            </div>
            <div className="flex items-center gap-1">
            <button onClick={() => setAlertsOpen(true)} aria-label={t('alerts')}
              className="relative w-12 h-12 rounded-full hover:bg-slate-100 flex items-center justify-center">
              <Bell className="w-6 h-6 text-slate-700" />
              {unread > 0 && (
                <span className="absolute top-1 right-1 min-w-[20px] h-5 px-1 rounded-full bg-rose-600 text-white text-xs font-bold flex items-center justify-center">{unread}</span>
              )}
            </button>
            <NavLink to="/settings" aria-label={t('profile')} title={t('profile')}
              className="w-12 h-12 rounded-full flex items-center justify-center">
              <span className="w-10 h-10 rounded-full bg-indigo-700 text-white text-lg font-bold flex items-center justify-center">
                {(shop?.owner_name ?? '?').trim().charAt(0).toUpperCase()}
              </span>
            </NavLink>
            </div>
          </header>

          <main className={
            isInnerScrollPage
              ? 'flex-1 min-h-0 w-full px-4 md:px-6 pt-4 md:pt-5 pb-20 md:pb-4 flex flex-col overflow-hidden'
              : 'flex-1 min-h-0 w-full px-4 md:px-6 py-4 md:py-5 pb-28 md:pb-8 overflow-y-auto overflow-x-hidden'
          }>
            {announcement?.maintenance_mode && (
              <div className="mb-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-900">
                Maintenance notice: {announcement.maintenance_message}
              </div>
            )}
            {announcement?.active && announcement.message && (!announcement.start_date || todayIST() >= announcement.start_date) && (!announcement.end_date || todayIST() <= announcement.end_date) && (
              <div className={`mb-3 rounded-xl border px-4 py-2.5 text-xs font-semibold ${
                announcement.type === 'critical'
                  ? 'border-rose-300 bg-rose-50 text-rose-900'
                  : announcement.type === 'warning'
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-indigo-200 bg-indigo-50 text-indigo-900'
              }`}>
                {announcement.message}
              </div>
            )}
            <Outlet />
          </main>
        </div>

        {/* Phone bottom bar */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 h-20 grid grid-cols-5 items-center pb-[env(safe-area-inset-bottom)]">
          {BOTTOM_LEFT.map(({ to, key, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `flex flex-col items-center gap-1 text-xs font-semibold ${isActive ? 'text-indigo-700' : 'text-slate-500'}`}>
              <Icon className="w-6 h-6" />{t(key)}
            </NavLink>
          ))}
          <NavLink to="/ledger" aria-label={t('nav_ledger')} className={({ isActive }) => `flex flex-col items-center gap-1 text-xs font-bold ${isActive ? 'text-indigo-800' : 'text-indigo-700'}`}>
            <span className="w-14 h-14 -mt-6 rounded-full bg-indigo-700 text-white shadow-lg flex items-center justify-center"><BookOpen className="w-7 h-7" /></span>
            {t('nav_ledger')}
          </NavLink>
          <NavLink to={BOTTOM_RIGHT.to} className={({ isActive }) => `flex flex-col items-center gap-1 text-xs font-semibold ${isActive ? 'text-indigo-700' : 'text-slate-500'}`}>
            <Wallet className="w-6 h-6" />{t(BOTTOM_RIGHT.key)}
          </NavLink>
          <button onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-1 text-xs font-semibold text-slate-500">
            <Menu className="w-6 h-6" />{t('nav_more')}
          </button>
        </nav>
      </div>

      {moreOpen && (
        <Sheet title={t('nav_more')} onClose={() => setMoreOpen(false)}>
          <div className="p-4 space-y-2">
            {EXTRA.map(({ to, key, icon: Icon }) => (
              <NavLink key={to} to={to} onClick={() => setMoreOpen(false)} className={navCls}><Icon className="w-5 h-5" /> {t(key)}</NavLink>
            ))}
            <p className="pt-3 text-base font-semibold text-slate-600 flex items-center gap-2"><Languages className="w-5 h-5" /> {t('language')}</p>
            {langPicker}
            <button onClick={doLogout} className="w-full mt-3 h-12 rounded-xl border-2 border-slate-200 text-base font-semibold text-rose-700 flex items-center justify-center gap-2">
              <LogOut className="w-5 h-5" /> {t('logout')}
            </button>
          </div>
        </Sheet>
      )}

      {alertsOpen && (
        <Sheet title={t('alerts')} onClose={() => setAlertsOpen(false)}>
          <div className="p-4 space-y-2">
            {!alerts.length && <p className="py-8 text-center text-base text-slate-500">{t('no_alerts')}</p>}
            {alerts.map(a => {
              if (a.kind === 'DUE' && a.bill) {
                const b = a.bill;
                const msg = b.type === 'SALE' ? t('alert_collect', { amount: rs(b.pending_paise), party: b.party_name })
                                              : t('alert_pay', { amount: rs(b.pending_paise), party: b.party_name });
                return (
                  <button key={a.id} onClick={() => { setAlertsOpen(false); shell.openPayment(b.id); }}
                    className={`w-full text-left p-3 rounded-xl border-2 ${b.type === 'SALE' ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
                    <p className="text-base font-semibold text-slate-900">{msg}</p>
                    <p className="text-sm text-slate-600">{t('bill_ref', { no: b.invoice_number })} · {t('due_on', { date: b.due_date ?? '' })}</p>
                  </button>
                );
              }
              return (
                <div key={a.id} onClick={() => markRead(a.id)}
                  className={`p-3 rounded-xl border-2 ${a.read ? 'border-slate-200' : 'border-indigo-300 bg-indigo-50'}`}>
                  <p className="text-base text-slate-900">
                    {a.kind === 'SHOP_APPROVED' ? t('alert_approved') : t('alert_rejected', { reason: a.reason ?? '' })}
                  </p>
                </div>
              );
            })}
          </div>
        </Sheet>
      )}

      <NewTransactionModal
        isOpen={billOpen}
        onClose={() => setBillOpen(false)}
        onSuccess={() => undefined}
        parties={parties}
        preselectedPartyId={billOpts.partyId}
        draft={billOpts.draft}
        onNavigateToNewParty={() => navigate('/parties?new=1')}
        onScan={shell.openScan}
      />
      <ScanBillSheet
        isOpen={scanOpen}
        onClose={() => setScanOpen(false)}
        parties={parties}
        onContinue={(partyId, draft) => { setScanOpen(false); shell.openNewBill({ partyId, draft }); }}
      />
      <RecordPaymentModal
        isOpen={!!payBill}
        onClose={() => setPayBill(null)}
        onSuccess={() => undefined}
        initialTransactionId={payBill ?? undefined}
      />
    </ShellContext.Provider>
  );
};
