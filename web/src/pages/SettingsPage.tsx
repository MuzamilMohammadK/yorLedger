import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, Receipt, FileText, Bell, KeyRound, SlidersHorizontal, Database, Info, CheckCircle2, Loader2, ImagePlus, Trash2, Download, LogOut } from 'lucide-react';
import { AppPreferences, InvoiceSettings, NotificationSettings, ShopSettingsData, getStateByCode } from '@yorbalance/shared';
import { useAuth } from '../context/AuthContext';
import { useI18n, LANGUAGES, Lang, DATE_FORMATS, DateFormat, Theme, LANDING_PAGES, formatDate } from '../i18n';
import { api } from '../lib/api';
import { auth } from '../lib/firebase';
import { compressLogo } from '../lib/image';
import { shareFile } from '../lib/platform';

type Section = 'profile' | 'gst' | 'invoice' | 'notifications' | 'account' | 'prefs' | 'backup' | 'about';
const SECTIONS: { id: Section; key: string; icon: typeof Store }[] = [
  { id: 'profile', key: 'set_profile', icon: Store }, { id: 'gst', key: 'set_gst', icon: Receipt },
  { id: 'invoice', key: 'set_invoice', icon: FileText }, { id: 'notifications', key: 'set_notifications', icon: Bell },
  { id: 'account', key: 'set_account', icon: KeyRound }, { id: 'prefs', key: 'set_prefs', icon: SlidersHorizontal },
  { id: 'backup', key: 'set_backup', icon: Database }, { id: 'about', key: 'set_about', icon: Info }
];
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev';
const REPO = 'https://github.com/MuzamilMohammadK/yorLedger';

/** §12 Settings: eight sections; every control saves and takes effect. */
export const SettingsPage: React.FC = () => {
  const { t, lang, setLang, theme, setTheme, dateFormat, setDateFormat, landing, setLanding, fmtDate } = useI18n();
  const { shop, user, logout, sendResetEmail, refreshSession } = useAuth();
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>('profile');
  const [data, setData] = useState<ShopSettingsData | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [profile, setProfile] = useState({ owner_name: '', phone: '', email: '', address: '', pin_code: '' });
  const [gstRate, setGstRate] = useState('5');
  const [inv, setInv] = useState<InvoiceSettings | null>(null);
  const [notif, setNotif] = useState<NotificationSettings | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getShopSettings().then(d => {
      setData(d);
      setProfile({ owner_name: d.shop.owner_name, phone: d.shop.phone, email: d.shop.email, address: d.shop.address, pin_code: d.shop.pin_code ?? '' });
      setGstRate(String(d.shop.default_gst_bp / 100));
      setInv(d.invoice_settings);
      setNotif(d.notification_settings);
    }).catch(e => setMsg({ ok: false, text: e.message }));
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: t('saved') });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message ?? t('error_generic') });
    } finally {
      setBusy(false);
    }
  };

  const savePrefs = (patch: Partial<AppPreferences>) => api.updateAppPreferences(patch).catch(() => undefined);
  const field = 'w-full h-12 px-3 rounded-xl border-2 border-slate-200 bg-white text-base text-slate-900 focus:border-indigo-600 focus:outline-none';
  const lbl = 'block text-base font-semibold text-slate-800';
  const saveBtn = (onClick: () => void) => (
    <button onClick={onClick} disabled={busy} className="w-full sm:w-auto h-12 px-6 rounded-xl bg-indigo-700 text-white text-base font-bold flex items-center justify-center gap-2 disabled:opacity-60">
      {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : null}{t('save')}
    </button>
  );
  const toggle = (label: string, on: boolean, set: (v: boolean) => void) => (
    <label className="flex items-center justify-between gap-4 min-h-12 py-2 border-b border-slate-100 last:border-0 cursor-pointer">
      <span className="text-base text-slate-800">{label}</span>
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} className="w-6 h-6 accent-indigo-700" />
    </label>
  );
  const info = (label: string, value?: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
      <span className="text-base text-slate-500">{label}</span><span className="text-base font-semibold text-slate-900 text-right break-all">{value || '—'}</span>
    </div>
  );

  const exportCsv = (type: 'transactions' | 'parties') => run(async () => {
    const csv = await api.exportShopData(type);
    await shareFile(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `yorledger-${type}-${new Date().toISOString().slice(0, 10)}.csv`, type);
  });

  const statusCls = shop?.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : shop?.status === 'REJECTED' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-900';

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">{t('nav_settings')}</h1>
      <div className="md:grid md:grid-cols-[16rem_1fr] md:gap-6">
        {/* Section list: chips on phones, side list on desktop */}
        <nav className="flex md:flex-col gap-2 overflow-x-auto pb-2 md:pb-0 -mx-1 px-1">
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => { setSection(s.id); setMsg(null); }}
              className={`shrink-0 h-12 px-4 rounded-xl text-base font-semibold flex items-center gap-2 text-left ${section === s.id ? 'bg-indigo-700 text-white' : 'bg-white border-2 border-slate-200 text-slate-700'}`}>
              <s.icon className="w-5 h-5 shrink-0" /> {t(s.key as any)}
            </button>
          ))}
        </nav>

        <div className="mt-3 md:mt-0 rounded-2xl bg-white border border-slate-200 p-4 sm:p-6 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">{t(SECTIONS.find(s => s.id === section)!.key as any)}</h2>
          {msg && (
            <p className={`p-3 rounded-xl text-base flex items-center gap-2 ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
              {msg.ok && <CheckCircle2 className="w-5 h-5" />} {msg.text}
            </p>
          )}
          {!data && <Loader2 className="w-8 h-8 animate-spin text-slate-400" />}

          {/* 1. Shop profile (§12.3) */}
          {data && section === 'profile' && (
            <div className="space-y-4">
              {info(t('business_name'), data.shop.name)}
              {info(t('verification_status'), <span className={`px-3 py-1 rounded-full text-sm font-bold ${statusCls}`}>{t(`decision_${shop?.status}` as any) || shop?.status}</span>)}
              <p className="text-sm text-slate-500">{t('name_needs_review')}</p>
              <label className={lbl}>{t('owner_name')}<input value={profile.owner_name} onChange={e => setProfile({ ...profile, owner_name: e.target.value })} className={`${field} mt-1`} /></label>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className={lbl}>{t('mobile')}<input type="tel" value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} className={`${field} mt-1`} /></label>
                <label className={lbl}>{t('email')}<input type="email" value={profile.email} onChange={e => setProfile({ ...profile, email: e.target.value })} className={`${field} mt-1`} /></label>
              </div>
              <label className={lbl}>{t('address')}<textarea rows={2} value={profile.address} onChange={e => setProfile({ ...profile, address: e.target.value })} className={`${field} mt-1 h-auto py-2`} /></label>
              <div className="grid sm:grid-cols-2 gap-4">
                {info(t('state'), getStateByCode(data.shop.state_code)?.name)}
                <label className={lbl}>{t('pin')}<input inputMode="numeric" value={profile.pin_code} onChange={e => setProfile({ ...profile, pin_code: e.target.value.replace(/\D/g, '').slice(0, 6) })} className={`${field} mt-1`} /></label>
              </div>
              <div>
                <p className={lbl}>{t('shop_logo')}</p>
                <p className="text-sm text-slate-500">{t('logo_hint')}</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="w-20 h-20 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center">
                    {inv?.logo_data_url ? <img src={inv.logo_data_url} alt={t('shop_logo')} className="w-full h-full object-contain" /> : <ImagePlus className="w-7 h-7 text-slate-400" />}
                  </div>
                  <input ref={logoInput} type="file" accept="image/jpeg,image/png" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run(async () => { const url = await compressLogo(f); const r = await api.updateInvoiceSettings({ logo_data_url: url }); setInv(r.invoice_settings); }); }} />
                  <button onClick={() => logoInput.current?.click()} className="h-11 px-4 rounded-xl border-2 border-indigo-300 text-indigo-800 text-base font-semibold">{inv?.logo_data_url ? t('replace') : t('add_photo')}</button>
                  {inv?.logo_data_url && (
                    <button onClick={() => run(async () => { const r = await api.updateInvoiceSettings({ logo_data_url: null }); setInv(r.invoice_settings); })}
                      className="h-11 px-3 rounded-xl border-2 border-slate-200 text-base font-semibold flex items-center gap-1"><Trash2 className="w-5 h-5" /> {t('remove')}</button>
                  )}
                </div>
              </div>
              {saveBtn(() => run(async () => { await api.updateShopProfile(profile); await refreshSession(); }))}
            </div>
          )}

          {/* 2. GST & tax (§12.4) */}
          {data && section === 'gst' && (
            <div className="space-y-4">
              {info(t('gst_registration'), t('gst_registered'))}
              {info(t('gstin'), <span className="font-mono">{data.shop.gstin}</span>)}
              {info(t('registered_name'), data.shop.name)}
              {info(t('state'), `${getStateByCode(data.shop.state_code)?.name ?? ''} (${data.shop.state_code})`)}
              <p className="text-sm text-slate-500">{t('name_needs_review')}</p>
              <label className={lbl}>{t('default_gst')}
                <select value={gstRate} onChange={e => setGstRate(e.target.value)} className={`${field} mt-1`}>
                  {['0', '5', '12', '18', '28'].map(r => <option key={r} value={r}>{r}%</option>)}
                </select>
              </label>
              <p className="text-base text-slate-600">{t('default_gst_hint')}</p>
              <p className="p-3 rounded-xl bg-slate-50 text-base text-slate-700">{t('tax_rule_hint')}</p>
              {saveBtn(() => run(async () => { await api.updateGSTSettings({ default_gst_bp: Math.round(Number(gstRate) * 100) }); await refreshSession(); }))}
            </div>
          )}

          {/* 3. Invoice settings (§12.5) — used by the bill PDF and the next-number suggestion */}
          {inv && section === 'invoice' && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <label className={lbl}>{t('invoice_prefix')}<input value={inv.invoice_prefix} maxLength={10} onChange={e => setInv({ ...inv, invoice_prefix: e.target.value })} className={`${field} mt-1`} /></label>
                <label className={lbl}>{t('next_number')}<input inputMode="numeric" value={inv.suggested_next_number || ''} onChange={e => setInv({ ...inv, suggested_next_number: Number(e.target.value.replace(/\D/g, '')) || 1 })} className={`${field} mt-1`} /></label>
              </div>
              <p className="text-sm text-slate-500">{t('prefix_hint')}</p>
              <label className={lbl}>{t('date_display')}
                <select value={inv.date_format} onChange={e => setInv({ ...inv, date_format: e.target.value })} className={`${field} mt-1`}>
                  {DATE_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              <div>
                {toggle(t('show_logo'), inv.show_logo, v => setInv({ ...inv, show_logo: v }))}
                {toggle(t('show_gstin'), inv.show_gstin, v => setInv({ ...inv, show_gstin: v }))}
                {toggle(t('show_tax_breakdown'), inv.show_tax_breakdown, v => setInv({ ...inv, show_tax_breakdown: v }))}
              </div>
              <label className={lbl}>{t('footer_text')}<textarea rows={2} value={inv.invoice_footer} onChange={e => setInv({ ...inv, invoice_footer: e.target.value })} className={`${field} mt-1 h-auto py-2`} /></label>
              <label className={lbl}>{t('terms')}<textarea rows={3} value={inv.terms_and_conditions} onChange={e => setInv({ ...inv, terms_and_conditions: e.target.value })} className={`${field} mt-1 h-auto py-2`} /></label>
              {saveBtn(() => run(async () => { const { logo_data_url: _l, ...rest } = inv; setInv((await api.updateInvoiceSettings(rest)).invoice_settings); }))}
            </div>
          )}

          {/* 4. Notifications (§12.6) */}
          {notif && section === 'notifications' && (
            <div className="space-y-4">
              <div>
                {toggle(t('due_reminders_on'), notif.due_reminders, v => setNotif({ ...notif, due_reminders: v }))}
                {toggle(t('device_notifications'), notif.push_notifications, v => setNotif({ ...notif, push_notifications: v }))}
                {toggle(t('in_app_notices'), notif.in_app_notifications, v => setNotif({ ...notif, in_app_notifications: v }))}
              </div>
              <label className={lbl}>{t('default_lead')}
                <select value={notif.reminder_lead_time_days} onChange={e => setNotif({ ...notif, reminder_lead_time_days: Number(e.target.value) as 0 | 1 | 3 | 7 })} className={`${field} mt-1`}>
                  <option value={0}>{t('on_the_day')}</option><option value={1}>{t('one_day_before')}</option>
                  <option value={3}>{t('days_before', { n: 3 })}</option><option value={7}>{t('days_before', { n: 7 })}</option>
                </select>
              </label>
              <p className="text-base text-slate-600">{t('reminder_time')}</p>
              {saveBtn(() => run(async () => setNotif((await api.updateNotificationSettings(notif)).notification_settings)))}
            </div>
          )}

          {/* 5. Account & security (§12.7) */}
          {section === 'account' && (
            <div className="space-y-4">
              {info(t('owner_name'), shop?.owner_name)}
              {info(t('login_email'), user?.email)}
              {info(t('last_sign_in'), auth.currentUser?.metadata.lastSignInTime ? new Date(auth.currentUser.metadata.lastSignInTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—')}
              <button onClick={() => run(async () => { await sendResetEmail(user?.email ?? ''); setMsg({ ok: true, text: t('reset_sent') }); })}
                className="w-full h-12 rounded-xl border-2 border-indigo-300 text-indigo-800 text-base font-bold">{t('send_reset')}</button>
              <button onClick={async () => { await logout(); navigate('/login'); }}
                className="w-full h-12 rounded-xl border-2 border-slate-200 text-rose-700 text-base font-bold flex items-center justify-center gap-2"><LogOut className="w-5 h-5" /> {t('logout')}</button>
            </div>
          )}

          {/* 6. App preferences (§12.8) — apply immediately on this device and are saved to the shop */}
          {section === 'prefs' && (
            <div className="space-y-4">
              {info(t('currency'), 'INR (₹)')}
              {info(t('time_zone'), 'Asia/Kolkata (IST)')}
              <label className={lbl}>{t('language')}
                <select value={lang} onChange={e => { setLang(e.target.value as Lang); savePrefs({ language: e.target.value }); }} className={`${field} mt-1`}>
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </label>
              <label className={lbl}>{t('date_display')}
                <select value={dateFormat} onChange={e => { setDateFormat(e.target.value as DateFormat); savePrefs({ date_format: e.target.value }); }} className={`${field} mt-1`}>
                  {DATE_FORMATS.map(f => <option key={f} value={f}>{f} · {formatDate('2026-11-07', f)}</option>)}
                </select>
              </label>
              <label className={lbl}>{t('theme')}
                <select value={theme} onChange={e => { setTheme(e.target.value as Theme); savePrefs({ theme: e.target.value as Theme }); }} className={`${field} mt-1`}>
                  <option value="light">{t('theme_light')}</option><option value="dark">{t('theme_dark')}</option><option value="system">{t('theme_system')}</option>
                </select>
              </label>
              <label className={lbl}>{t('landing_page')}
                <select value={landing} onChange={e => { setLanding(e.target.value); savePrefs({ default_landing_page: e.target.value }); }} className={`${field} mt-1`}>
                  {LANDING_PAGES.map(p => <option key={p} value={p}>{t(({ '/dashboard': 'nav_home', '/ledger': 'nav_ledger', '/dues': 'nav_dues', '/history': 'nav_history', '/parties': 'nav_parties' } as const)[p])}</option>)}
                </select>
              </label>
            </div>
          )}

          {/* 7. Data & backup (§12.9) */}
          {section === 'backup' && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-2">
                <button onClick={() => exportCsv('transactions')} className="h-12 rounded-xl bg-indigo-700 text-white text-base font-bold flex items-center justify-center gap-2"><Download className="w-5 h-5" /> {t('export_transactions')}</button>
                <button onClick={() => exportCsv('parties')} className="h-12 rounded-xl bg-indigo-700 text-white text-base font-bold flex items-center justify-center gap-2"><Download className="w-5 h-5" /> {t('export_parties')}</button>
              </div>
              <button onClick={() => navigate('/reports')} className="w-full h-12 rounded-xl border-2 border-slate-200 text-base font-semibold">{t('open_reports_export')}</button>
              <p className="p-3 rounded-xl bg-amber-50 text-base text-amber-900">{t('backup_info')}</p>
              <p className="text-base text-slate-700">{t('privacy_info')}</p>
              <p className="text-base text-slate-700">{t('retention_info')}</p>
            </div>
          )}

          {/* 8. About (§12.10) */}
          {section === 'about' && (
            <div className="space-y-4">
              {info('YorLedger', t('tagline'))}
              {info(t('version'), APP_VERSION)}
              {info(t('developer'), 'YorLedger')}
              <section><h3 className="text-base font-bold text-slate-900">{t('terms_title')}</h3><p className="text-base text-slate-700">{t('terms_body')}</p></section>
              <section><h3 className="text-base font-bold text-slate-900">{t('privacy_title')}</h3><p className="text-base text-slate-700">{t('privacy_info')}</p></section>
              <section>
                <h3 className="text-base font-bold text-slate-900">{t('help_support')}</h3>
                <a href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex h-12 px-4 rounded-xl border-2 border-slate-200 text-base font-semibold items-center">{t('report_problem')}</a>
              </section>
              <p className="text-sm text-slate-500">{t('decision_APPROVED')}: {fmtDate(shop?.verified_at?.slice(0, 10))}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
