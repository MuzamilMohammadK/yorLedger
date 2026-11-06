import React, { useEffect, useState } from 'react';
import { Users, Truck, Scissors, Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { INDIAN_STATES, Party, PartyType, validateGSTIN } from '@yorbalance/shared';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { Sheet } from '../ledger/NewTransactionModal';

interface PartyFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (party: Party) => void;
  initialParty?: Party | null; // edit when given, add otherwise
  /** Pre-fill from a scanned invoice (name, GSTIN, phone…). */
  prefill?: Partial<Party> | null;
}

const TYPES: { type: PartyType; icon: typeof Users }[] = [
  { type: 'CUSTOMER', icon: Users },
  { type: 'SUPPLIER', icon: Truck },
  { type: 'ARTISAN', icon: Scissors }
];

export const PartyFormModal: React.FC<PartyFormModalProps> = ({ isOpen, onClose, onSuccess, initialParty, prefill }) => {
  const { t } = useI18n();
  const { shop } = useAuth();
  const [type, setType] = useState<PartyType>('CUSTOMER');
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [phones, setPhones] = useState<string[]>(['']);
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [pin, setPin] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [dup, setDup] = useState<Party | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const p = initialParty ?? prefill ?? {};
    setType(p.type ?? 'CUSTOMER');
    setName(p.name ?? '');
    setOwner(p.owner_name ?? '');
    setPhones([p.phone ?? '', ...(p.additional_phones ?? [])]);
    setGstin(p.gstin ?? '');
    setAddress(p.address ?? '');
    setStateCode(p.state_code || shop?.state_code || '');
    setPin(p.pin_code ?? '');
    setNotes(p.notes ?? '');
    setErrors({});
    setFormError(null);
    setDup(null);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  // A valid GSTIN tells us the state.
  const onGstin = (v: string) => {
    const g = v.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15);
    setGstin(g);
    if (g.length === 15) {
      const r = validateGSTIN(g);
      if (r.valid && r.stateCode) setStateCode(r.stateCode);
    }
  };

  const save = async () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t('required');
    if (!owner.trim()) errs.owner_name = t('required');
    if (phones[0].replace(/\D/g, '').length < 10) errs.phone = t('required');
    if (gstin && !validateGSTIN(gstin).valid) errs.gstin = validateGSTIN(gstin).error ?? 'GSTIN';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    setFormError(null);
    try {
      const d = await api.checkDuplicateParty({ phone: phones[0], gstin: gstin || undefined, excludePartyId: initialParty?.id });
      if (d.isDuplicate && d.existingParty) { setDup(d.existingParty); return; }
      const st = INDIAN_STATES.find(s => s.code === stateCode);
      const payload = {
        type, name, owner_name: owner, phone: phones[0], additional_phones: phones.slice(1).filter(p => p.trim()),
        gstin: gstin || null, address, state: st?.name ?? '', state_code: stateCode, pin_code: pin, notes: notes || null
      };
      const res = initialParty ? await api.updateParty(initialParty.id, payload) : await api.createParty(payload);
      onSuccess(res.party);
      onClose();
    } catch (e) {
      if (e instanceof ApiError) { setFormError(e.message); if (e.fields) setErrors(e.fields); }
      else setFormError(navigator.onLine ? t('error_generic') : t('error_offline'));
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full h-12 px-3 rounded-xl border-2 border-slate-200 bg-white text-base text-slate-900 focus:border-indigo-600 focus:outline-none';
  const lbl = 'block text-base font-semibold text-slate-800 mb-1';
  const err = (k: string) => errors[k] && <p className="mt-1 text-sm text-rose-600">{errors[k]}</p>;

  return (
    <Sheet title={initialParty ? t('party_edit') : t('party_new')} onClose={onClose}>
      <div className="p-4 sm:p-6 space-y-4">
        {formError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-base flex gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /> {formError}
          </div>
        )}
        {dup && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-base">
            {t('already_added', { name: dup.name })} ({dup.phone})
            <button className="ml-2 underline font-bold" onClick={() => { onSuccess(dup); onClose(); }}>{t('open_existing')}</button>
          </div>
        )}

        <div>
          <p className={lbl}>{t('who_is_party')}</p>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map(({ type: ty, icon: Icon }) => (
              <button key={ty} type="button" onClick={() => setType(ty)}
                className={`min-h-[72px] rounded-2xl border-2 flex flex-col items-center justify-center gap-1 ${type === ty ? 'border-indigo-600 bg-indigo-50 text-indigo-900' : 'border-slate-200 text-slate-600'}`}>
                <Icon className="w-7 h-7" /><span className="text-base font-bold">{t(`type_${ty}` as any)}</span>
              </button>
            ))}
          </div>
        </div>

        <label className={lbl}>{t('business_name')}
          <input value={name} onChange={e => setName(e.target.value)} className={field} />{err('name')}
        </label>
        <label className={lbl}>{t('owner_name')}
          <input value={owner} onChange={e => setOwner(e.target.value)} className={field} />{err('owner_name')}
        </label>

        <div>
          <p className={lbl}>{t('mobile')}</p>
          <div className="space-y-2">
            {phones.map((ph, i) => (
              <div key={i} className="flex gap-2">
                <input type="tel" inputMode="tel" value={ph} placeholder="98480 12345"
                  onChange={e => setPhones(phones.map((x, k) => (k === i ? e.target.value.replace(/[^\d+\s]/g, '') : x)))} className={field} />
                {i > 0 && (
                  <button type="button" aria-label={t('remove_item')} onClick={() => setPhones(phones.filter((_, k) => k !== i))}
                    className="w-12 h-12 shrink-0 rounded-xl border-2 border-slate-200 flex items-center justify-center text-slate-500"><Trash2 className="w-5 h-5" /></button>
                )}
              </div>
            ))}
          </div>
          {err('phone')}
          <button type="button" onClick={() => setPhones([...phones, ''])} className="mt-2 h-10 text-base font-semibold text-indigo-700 flex items-center gap-1">
            <Plus className="w-5 h-5" /> {t('add_mobile')}
          </button>
        </div>

        <label className={lbl}>{t('gstin_opt')}
          <input value={gstin} onChange={e => onGstin(e.target.value)} placeholder="36AAACM8401P1Z3" className={`${field} font-mono uppercase`} />{err('gstin')}
        </label>
        <label className={lbl}>{t('address')}
          <textarea rows={2} value={address} onChange={e => setAddress(e.target.value)} className={`${field} h-auto py-2`} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={lbl}>{t('state')}
            <select value={stateCode} onChange={e => setStateCode(e.target.value)} className={field}>
              <option value="">—</option>
              {INDIAN_STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </label>
          <label className={lbl}>{t('pin')}
            <input inputMode="numeric" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} className={field} />
          </label>
        </div>
        <label className={lbl}>{t('notes')}
          <input value={notes} onChange={e => setNotes(e.target.value)} className={field} />
        </label>

        <button type="button" onClick={save} disabled={busy}
          className="w-full h-14 rounded-2xl bg-indigo-700 text-white text-lg font-bold flex items-center justify-center gap-2 disabled:opacity-60">
          {busy ? <><Loader2 className="w-6 h-6 animate-spin" /> {t('saving')}</> : t('save_party')}
        </button>
      </div>
    </Sheet>
  );
};
