import React, { createContext, useContext, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Home, Users, Plus, Wallet, Menu, ScrollText, BarChart3, Settings, LogOut, Bell, Languages, X } from 'lucide-react';
import { BillKind, Party, formatPaiseToINR } from '@yorbalance/shared';
import { useAuth } from '../../context/AuthContext';
import { useI18n, LANGUAGES } from '../../i18n';
import { api } from '../../lib/api';
import { useAlerts, useLive } from '../../lib/useLiveData';
import { NewTransactionModal, DraftBill, Sheet } from '../ledger/NewTransactionModal';
import { RecordPaymentModal } from '../dues/RecordPaymentModal';

interface ShellApi {
  openNewBill: (opts?: { partyId?: string; kind?: BillKind; draft?: Partial<DraftBill> }) => void;
  openPayment: (billId: string) => void;
}
const ShellContext = createContext<ShellApi | null>(null);
export const useShell = () => {
  const c = useContext(ShellContext);
  if (!c) throw new Error('useShell outside AppShell');
  return c;
};

const MAIN = [
  { to: '/dashboard', key: 'nav_home', icon: Home },
  { to: '/parties', key: 'nav_parties', icon: Users },
  { to: '/dues', key: 'nav_dues', icon: Wallet }
] as const;
const EXTRA = [
  { to: '/history', key: 'nav_history', icon: ScrollText },
  { to: '/analytics', key: 'nav_reports', icon: BarChart3 },
  { to: '/settings', key: 'nav_settings', icon: Settings }
] as const;

/** Frame for every signed-in, approved shop screen. */
export const AppShell: React.FC = () => {
  const { shop, logout, isApproved } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const [billOpen, setBillOpen] = useState(false);
  const [billOpts, setBillOpts] = useState<{ partyId?: string; draft?: Partial<DraftBill> | null }>({});
  const [payBill, setPayBill] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const { data: partyData } = useLive(() => api.getParties(), []);
  const parties: Party[] = partyData?.parties ?? [];
  const { alerts, unread, markRead } = useAlerts(isApproved);

  const shell: ShellApi = {
    openNewBill: (o = {}) => {
      setBillOpts({ partyId: o.partyId, draft: o.draft ?? (o.kind ? { kind: o.kind } : null) });
      setBillOpen(true);
    },
    openPayment: id => setPayBill(id)
  };

  const rs = (p: number) => formatPaiseToINR(p, true);
  const navCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 h-12 rounded-xl text-base font-semibold ${isActive ? 'bg-indigo-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`;

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
      <div className="min-h-screen bg-slate-50 md:flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex md:w-64 shrink-0 flex-col gap-2 border-r border-slate-200 bg-white p-4 sticky top-0 h-screen">
          <div className="px-2 pb-3">
            <p className="text-xl font-extrabold text-indigo-800">YorLedger</p>
            <p className="text-sm text-slate-500 truncate">{shop?.name}</p>
          </div>
          <button onClick={() => shell.openNewBill()}
            className="h-14 rounded-2xl bg-indigo-700 text-white text-lg font-bold flex items-center justify-center gap-2 mb-2">
            <Plus className="w-6 h-6" /> {t('nav_new_bill')}
          </button>
          {[...MAIN, ...EXTRA].map(({ to, key, icon: Icon }) => (
            <NavLink key={to} to={to} className={navCls}><Icon className="w-5 h-5" /> {t(key)}</NavLink>
          ))}
          <div className="mt-auto space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-500 mb-2 flex items-center gap-2"><Languages className="w-4 h-4" /> {t('language')}</p>
              {langPicker}
            </div>
            <button onClick={doLogout} className="w-full h-12 rounded-xl border-2 border-slate-200 text-base font-semibold text-rose-700 flex items-center justify-center gap-2">
              <LogOut className="w-5 h-5" /> {t('logout')}
            </button>
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-30 bg-white border-b border-slate-200 h-16 px-4 flex items-center justify-between">
            <div className="min-w-0">
              <p className="md:hidden text-lg font-extrabold text-indigo-800 leading-tight">YorLedger</p>
              <p className="text-sm md:text-base text-slate-600 truncate">{shop?.name}</p>
            </div>
            <button onClick={() => setAlertsOpen(true)} aria-label={t('alerts')}
              className="relative w-12 h-12 rounded-full hover:bg-slate-100 flex items-center justify-center">
              <Bell className="w-6 h-6 text-slate-700" />
              {unread > 0 && (
                <span className="absolute top-1 right-1 min-w-[20px] h-5 px-1 rounded-full bg-rose-600 text-white text-xs font-bold flex items-center justify-center">{unread}</span>
              )}
            </button>
          </header>

          <main className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-6 pb-28 md:pb-8">
            <Outlet />
          </main>
        </div>

        {/* Phone bottom bar */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 h-20 grid grid-cols-5 items-center pb-[env(safe-area-inset-bottom)]">
          {MAIN.slice(0, 2).map(({ to, key, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `flex flex-col items-center gap-1 text-xs font-semibold ${isActive ? 'text-indigo-700' : 'text-slate-500'}`}>
              <Icon className="w-6 h-6" />{t(key)}
            </NavLink>
          ))}
          <button onClick={() => shell.openNewBill()} aria-label={t('nav_new_bill')} className="flex flex-col items-center gap-1 text-xs font-bold text-indigo-700">
            <span className="w-14 h-14 -mt-6 rounded-full bg-indigo-700 text-white shadow-lg flex items-center justify-center"><Plus className="w-8 h-8" /></span>
            {t('nav_new_bill')}
          </button>
          <NavLink to="/dues" className={({ isActive }) => `flex flex-col items-center gap-1 text-xs font-semibold ${isActive ? 'text-indigo-700' : 'text-slate-500'}`}>
            <Wallet className="w-6 h-6" />{t('nav_dues')}
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
