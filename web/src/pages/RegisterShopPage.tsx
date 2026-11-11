import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { ShopDocumentType, getStateByCode, normalizePhone, validateGSTIN, validatePinCode } from '@yorbalance/shared';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { ApiError } from '../lib/api';
import { DocumentUploader, DocSlotState, uploadsOf } from '../components/verification/DocumentUploader';

const GST_RATES = [0, 5, 12, 18, 28];

/** §4.3 Shop registration. Admin reviews before the shop can use any business module. */
export const RegisterShopPage: React.FC = () => {
  const { registerShop, user, shop } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const signedInWithoutShop = !!user && !shop && user.role === 'OWNER';

  const [f, setF] = useState({
    shop_name: '', owner_name: '', gstin: '', mobile: '', address: '', pin_code: '', default_gst: '5',
    email: user?.email ?? '', password: '', confirm_password: ''
  });
  const [docs, setDocs] = useState<Partial<Record<ShopDocumentType, DocSlotState>>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  if (shop) return <Navigate to={shop.status === 'APPROVED' ? '/dashboard' : '/pending-approval'} replace />;

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  const gst = f.gstin.length === 15 ? validateGSTIN(f.gstin) : null;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!f.shop_name.trim()) e.shop_name = t('required');
    if (!f.owner_name.trim()) e.owner_name = t('required');
    const g = validateGSTIN(f.gstin);
    if (!g.valid) e.gstin = g.error ?? t('required');
    if (!normalizePhone(f.mobile)) e.mobile = t('required');
    if (!f.address.trim()) e.address = t('required');
    if (f.pin_code && !validatePinCode(f.pin_code)) e.pin_code = t('pin');
    if (!signedInWithoutShop) {
      if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = t('required');
      if (f.password.length < 8) e.password = t('password_min');
      if (f.password !== f.confirm_password) e.confirm_password = t('passwords_differ');
    }
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setBusy(true);
    setFormError(null);
    try {
      await registerShop(f.email.trim(), f.password, {
        shop_name: f.shop_name, owner_name: f.owner_name, gstin: f.gstin, mobile: f.mobile, address: f.address,
        pin_code: f.pin_code, state_code: gst?.stateCode ?? '', default_gst_bp: Number(f.default_gst) * 100,
        documents: uploadsOf(docs)
      });
      navigate('/pending-approval', { replace: true });
    } catch (e: any) {
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      setFormError(e?.code === 'auth/email-already-in-use' ? 'This email is already registered. Please sign in.' : e?.message ?? t('error_generic'));
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full h-12 px-3 rounded-xl border-2 border-slate-200 bg-white text-base text-slate-900 focus:border-indigo-600 focus:outline-none';
  // Plain function (not a component) so inputs keep focus while typing.
  const L = ({ k, label, children }: { k: string; label: string; children: React.ReactNode }) => (
    <label className="block text-base font-semibold text-slate-800">
      {label}
      <div className="mt-1">{children}</div>
      {errors[k] && <span className="block mt-1 text-sm font-normal text-rose-600">{errors[k]}</span>}
    </label>
  );

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <form onSubmit={submit} className="max-w-2xl mx-auto space-y-6" noValidate>
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-slate-900">{t('reg_title')}</h1>
          <p className="mt-1 text-base text-slate-600">{t('reg_sub')}</p>
        </div>

        {formError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-base flex gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /> {formError}
          </div>
        )}

        <section className="rounded-3xl bg-white border border-slate-200 p-4 sm:p-6 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">{t('shop_details')}</h2>
          {L({ k: 'shop_name', label: t('business_name'), children: (<><input value={f.shop_name} onChange={set('shop_name')} className={field} /></>) })}
          {L({ k: 'owner_name', label: t('owner_name'), children: (<><input value={f.owner_name} onChange={set('owner_name')} className={field} /></>) })}
          {L({ k: 'gstin', label: t('gstin'), children: (<>
            <input value={f.gstin} maxLength={15} placeholder="29ABCDE1234F1Z5"
              onChange={e => setF({ ...f, gstin: e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '') })}
              className={`${field} font-mono uppercase`} />
          </>) })}
          {gst?.valid && (
            <p className="-mt-2 text-sm font-semibold text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> {t('gstin_ok', { state: getStateByCode(gst.stateCode!)?.name ?? '' })}
            </p>
          )}
          {gst && !gst.valid && <p className="-mt-2 text-sm text-rose-600">{gst.error}</p>}
          <div className="grid sm:grid-cols-2 gap-4">
            {L({ k: 'mobile', label: t('mobile'), children: (<><input type="tel" inputMode="tel" value={f.mobile} onChange={set('mobile')} className={field} /></>) })}
            {L({ k: 'default_gst', label: t('default_gst'), children: (<>
              <select value={f.default_gst} onChange={set('default_gst')} className={field}>
                {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
              </select>
            </>) })}
          </div>
          {L({ k: 'address', label: t('address'), children: (<><textarea rows={2} value={f.address} onChange={set('address')} className={`${field} h-auto py-2`} /></>) })}
          <div className="grid sm:grid-cols-2 gap-4">
            {L({ k: 'state', label: t('state'), children: (<>
              <input readOnly value={gst?.valid ? getStateByCode(gst.stateCode!)?.name ?? '' : ''} placeholder="—" className={`${field} bg-slate-50`} />
            </>) })}
            {L({ k: 'pin_code', label: t('pin'), children: (<>
              <input inputMode="numeric" value={f.pin_code} onChange={e => setF({ ...f, pin_code: e.target.value.replace(/\D/g, '').slice(0, 6) })} className={field} />
            </>) })}
          </div>
        </section>

        <section className="rounded-3xl bg-white border border-slate-200 p-4 sm:p-6 space-y-3">
          <h2 className="text-xl font-bold text-slate-900">{t('documents')}</h2>
          <p className="text-base text-slate-600">{t('documents_hint')}</p>
          <DocumentUploader value={docs} onChange={setDocs} errors={errors} disabled={busy} />
        </section>

        {!signedInWithoutShop && (
          <section className="rounded-3xl bg-white border border-slate-200 p-4 sm:p-6 space-y-4">
            <h2 className="text-xl font-bold text-slate-900">{t('login_details')}</h2>
            {L({ k: 'email', label: t('email'), children: (<><input type="email" autoComplete="email" value={f.email} onChange={set('email')} className={field} /></>) })}
            <div className="grid sm:grid-cols-2 gap-4">
              {L({ k: 'password', label: `${t('password')} (${t('password_min')})`, children: (<>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} autoComplete="new-password" value={f.password} onChange={set('password')} className={`${field} pr-12`} />
                  <button type="button" onClick={() => setShowPw(!showPw)} aria-label="Show password"
                    className="absolute right-1 top-1 w-10 h-10 flex items-center justify-center text-slate-500">
                    {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </>) })}
              {L({ k: 'confirm_password', label: t('confirm_password'), children: (<>
                <input type={showPw ? 'text' : 'password'} autoComplete="new-password" value={f.confirm_password} onChange={set('confirm_password')} className={field} />
              </>) })}
            </div>
          </section>
        )}

        <button type="submit" disabled={busy}
          className="w-full h-14 rounded-2xl bg-indigo-700 text-white text-lg font-bold flex items-center justify-center gap-2 disabled:opacity-60">
          {busy ? <><Loader2 className="w-6 h-6 animate-spin" /> {t('saving')}</> : t('register_submit')}
        </button>
        <p className="text-center"><Link to="/login" className="text-base font-semibold text-indigo-700">{t('have_account')}</Link></p>
      </form>
    </div>
  );
};
