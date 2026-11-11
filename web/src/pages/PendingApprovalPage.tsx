import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Clock, AlertTriangle, CheckCircle2, Loader2, LogOut } from 'lucide-react';
import { ShopDocumentType, ShopVerification, normalizePhone, validateGSTIN, validatePinCode, getStateByCode } from '@yorbalance/shared';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { api, ApiError } from '../lib/api';
import { verificationHistory } from '../lib/data/session';
import { DocumentUploader, DocSlotState, removedOf, uploadsOf } from '../components/verification/DocumentUploader';

/** §4.4 PENDING: waiting screen. REJECTED: reason + correct and resubmit. Status updates live. */
export const PendingApprovalPage: React.FC = () => {
  const { user, shop, latestVerification, refreshSession, logout, loading } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<Partial<Record<ShopDocumentType, DocSlotState>>>({});
  const [history, setHistory] = useState<ShopVerification[]>([]);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ shop_name: '', owner_name: '', gstin: '', mobile: '', address: '', pin_code: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reload documents + review rounds whenever the status changes (admin decision arrives live).
  useEffect(() => {
    if (!shop) return;
    api.getMyShopDocuments().then(list => setDocs(Object.fromEntries(list.map(d => [d.type, { stored: d }])))).catch(() => undefined);
    verificationHistory(shop.id).then(setHistory).catch(() => undefined);
    setF({ shop_name: shop.name, owner_name: shop.owner_name, gstin: shop.gstin, mobile: shop.phone, address: shop.address, pin_code: shop.pin_code ?? '' });
  }, [shop?.id, shop?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loading && !user) return <Navigate to="/login" replace />;
  if (!loading && user && !shop) return <Navigate to="/register-shop" replace />;
  if (!shop) return null;

  const rejected = shop.status === 'REJECTED';
  const approved = shop.status === 'APPROVED';
  const field = 'w-full h-12 px-3 rounded-xl border-2 border-slate-200 bg-white text-base text-slate-900 focus:border-indigo-600 focus:outline-none';

  const resubmit = async () => {
    const e: Record<string, string> = {};
    if (!f.shop_name.trim()) e.shop_name = t('required');
    if (!f.owner_name.trim()) e.owner_name = t('required');
    if (!validateGSTIN(f.gstin).valid) e.gstin = validateGSTIN(f.gstin).error ?? t('required');
    if (!normalizePhone(f.mobile)) e.mobile = t('required');
    if (!f.address.trim()) e.address = t('required');
    if (f.pin_code && !validatePinCode(f.pin_code)) e.pin_code = t('pin');
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setFormError(null);
    try {
      await api.resubmitShop({ ...f, documents: uploadsOf(docs), removed_documents: removedOf(docs) });
      setEditing(false);
      await refreshSession();
    } catch (err: any) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      setFormError(err?.message ?? t('error_generic'));
    } finally {
      setBusy(false);
    }
  };

  const row = (label: string, value?: string | null) => (
    <div className="flex justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
      <span className="text-base text-slate-500">{label}</span><span className="text-base font-semibold text-slate-900 text-right break-all">{value || '—'}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-5">
        <div className={`rounded-3xl p-6 text-center ${approved ? 'bg-emerald-50 border-2 border-emerald-200' : rejected ? 'bg-rose-50 border-2 border-rose-200' : 'bg-amber-50 border-2 border-amber-200'}`}>
          {approved ? <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-600" />
            : rejected ? <AlertTriangle className="w-14 h-14 mx-auto text-rose-600" /> : <Clock className="w-14 h-14 mx-auto text-amber-600" />}
          <h1 className="mt-3 text-2xl font-extrabold text-slate-900">{approved ? t('approved_title') : rejected ? t('rejected_title') : t('pending_title')}</h1>
          <p className="mt-1 text-base text-slate-700">{approved ? '' : rejected ? t('rejected_sub') : t('pending_sub')}</p>
          {rejected && latestVerification?.reason && (
            <p className="mt-3 p-3 rounded-xl bg-white text-base text-rose-900 text-left"><b>{t('reason')}:</b> {latestVerification.reason}</p>
          )}
          {approved && (
            <button onClick={() => navigate('/dashboard')} className="mt-4 w-full h-14 rounded-2xl bg-emerald-700 text-white text-lg font-bold">{t('open_app')}</button>
          )}
        </div>

        {!editing ? (
          <section className="rounded-3xl bg-white border border-slate-200 p-4 sm:p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-2">{t('submitted_details')}</h2>
            {row(t('business_name'), shop.name)}
            {row(t('owner_name'), shop.owner_name)}
            {row(t('gstin'), shop.gstin)}
            {row(t('state'), getStateByCode(shop.state_code)?.name)}
            {row(t('mobile'), shop.phone)}
            {row(t('email'), shop.email)}
            {row(t('address'), shop.address)}
            {row(t('pin'), shop.pin_code)}
            {row(t('default_gst'), `${shop.default_gst_bp / 100}%`)}
            {rejected && (
              <button onClick={() => setEditing(true)} className="mt-4 w-full h-14 rounded-2xl bg-indigo-700 text-white text-lg font-bold">{t('fix_and_resend')}</button>
            )}
          </section>
        ) : (
          <section className="rounded-3xl bg-white border border-slate-200 p-4 sm:p-6 space-y-4">
            <h2 className="text-xl font-bold text-slate-900">{t('fix_and_resend')}</h2>
            {formError && <p className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-base">{formError}</p>}
            {([['shop_name', t('business_name')], ['owner_name', t('owner_name')], ['gstin', t('gstin')], ['mobile', t('mobile')], ['address', t('address')], ['pin_code', t('pin')]] as const).map(([k, label]) => (
              <label key={k} className="block text-base font-semibold text-slate-800">{label}
                <input value={f[k]} onChange={e => setF({ ...f, [k]: k === 'gstin' ? e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '') : e.target.value })}
                  className={`${field} mt-1 ${k === 'gstin' ? 'font-mono' : ''}`} />
                {errors[k] && <span className="block mt-1 text-sm font-normal text-rose-600">{errors[k]}</span>}
              </label>
            ))}
          </section>
        )}

        <section className="rounded-3xl bg-white border border-slate-200 p-4 sm:p-6 space-y-3">
          <h2 className="text-xl font-bold text-slate-900">{t('documents')}</h2>
          <DocumentUploader value={docs} onChange={setDocs} errors={errors} disabled={!editing || busy} />
        </section>

        {editing && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setEditing(false)} className="h-14 rounded-2xl border-2 border-slate-300 text-lg font-bold">{t('cancel')}</button>
            <button onClick={resubmit} disabled={busy} className="h-14 rounded-2xl bg-indigo-700 text-white text-lg font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : t('resend')}
            </button>
          </div>
        )}

        {!!history.length && (
          <section className="rounded-3xl bg-white border border-slate-200 p-4 sm:p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-2">{t('review_history')}</h2>
            {history.map(h => (
              <div key={h.id} className="py-2 border-b border-slate-100 last:border-0">
                <p className={`text-base font-bold ${h.decision === 'APPROVED' ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {t(`decision_${h.decision}` as any)} · {new Date(h.decided_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                </p>
                {h.reason && <p className="text-base text-slate-700">{h.reason}</p>}
              </div>
            ))}
          </section>
        )}

        <button onClick={async () => { await logout(); navigate('/login'); }}
          className="w-full h-12 rounded-xl border-2 border-slate-200 text-base font-semibold text-rose-700 flex items-center justify-center gap-2">
          <LogOut className="w-5 h-5" /> {t('logout')}
        </button>
      </div>
    </div>
  );
};
