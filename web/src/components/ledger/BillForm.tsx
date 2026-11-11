import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, ShoppingBag, Truck, Scissors, Loader2, CheckCircle2, ChevronDown, ChevronUp, MessageCircle, AlertTriangle, Search, UserPlus, Camera, FileText, Share2 } from 'lucide-react';
import { BillKind, Party, Transaction, computeTax, formatPaiseToINR, getStateByCode, normalizeInvoice } from '@yorbalance/shared';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { todayIST } from '../../lib/data/util';
import { billMessage, openWhatsApp } from '../../lib/whatsapp';
import { billPdfUrl, openBillPdf, shareBillPdf } from '../../lib/pdf';

export interface DraftItem { name: string; qty: string; rate: string }
export interface DraftBill { kind: BillKind; partyId: string; invoiceNo: string; billDate: string; items: DraftItem[]; gstPercent: string }

const KIND_FOR_PARTY: Record<Party['type'], BillKind> = { CUSTOMER: 'SALE', SUPPLIER: 'PURCHASE', ARTISAN: 'JOB_WORK' };
const KIND_UI: Record<BillKind, { icon: typeof ShoppingBag; on: string }> = {
  SALE: { icon: ShoppingBag, on: 'border-emerald-600 bg-emerald-50 text-emerald-900' },
  PURCHASE: { icon: Truck, on: 'border-sky-600 bg-sky-50 text-sky-900' },
  JOB_WORK: { icon: Scissors, on: 'border-amber-600 bg-amber-50 text-amber-900' }
};
const emptyItem = (): DraftItem => ({ name: '', qty: '1', rate: '' });

/** Rupee text from an input -> paise, or null if not a valid amount. */
export function toPaise(v: string): number | null {
  const s = v.trim();
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [w, f = ''] = s.split('.');
  return parseInt(w, 10) * 100 + parseInt((f + '00').slice(0, 2), 10);
}

interface Props {
  parties: Party[];
  /** Bill kinds offered (Sales view: SALE; Purchases view: PURCHASE + JOB_WORK). */
  kinds?: BillKind[];
  partyId?: string | null;
  onPartyChange?: (id: string | null) => void;
  draft?: Partial<DraftBill> | null;
  onSaved?: (tx: Transaction) => void;
  onDone?: () => void;
  onScan?: () => void;
  onNewParty?: () => void;
}

/**
 * §8.3 bill entry: single party search, party state drives the tax preview, digits-only
 * invoice (filters typing and paste, strips leading zeros on blur, rejects zero), SALE
 * availability check after 400 ms, item rows + Add Another Item, live CGST/SGST/IGST and
 * total from the same shared function the save uses, then the bill PDF with share actions.
 */
export const BillForm: React.FC<Props> = ({ parties, kinds = ['SALE', 'PURCHASE', 'JOB_WORK'], partyId: partyProp, onPartyChange, draft, onSaved, onDone, onScan, onNewParty }) => {
  const { shop } = useAuth();
  const { t } = useI18n();
  const defaultGst = String((shop?.default_gst_bp ?? 500) / 100);

  const initialKind = (): BillKind => {
    const p = parties.find(x => x.id === (draft?.partyId ?? partyProp));
    const k = draft?.kind ?? (p ? KIND_FOR_PARTY[p.type] : kinds[0]);
    return kinds.includes(k) ? k : kinds[0];
  };
  const [kind, setKind] = useState<BillKind>(initialKind);
  const [partyIdState, setPartyIdState] = useState<string>(draft?.partyId ?? partyProp ?? '');
  const partyId = partyProp !== undefined && !draft?.partyId ? (partyProp ?? '') : partyIdState;
  const setPartyId = (id: string) => { setPartyIdState(id); onPartyChange?.(id || null); };
  const [partyQuery, setPartyQuery] = useState('');
  const [invoiceNo, setInvoiceNo] = useState(draft?.invoiceNo ?? '');
  const [invoiceState, setInvoiceState] = useState<'idle' | 'checking' | 'free' | 'used'>('idle');
  const [billDate, setBillDate] = useState(draft?.billDate ?? todayIST());
  const [items, setItems] = useState<DraftItem[]>(draft?.items?.length ? draft.items : [emptyItem()]);
  const [gstPercent, setGstPercent] = useState(draft?.gstPercent ?? defaultGst);
  const [taxOverride, setTaxOverride] = useState<'' | 'INTRA' | 'INTER'>('');
  const [remindOn, setRemindOn] = useState('');
  const [leadDays, setLeadDays] = useState<0 | 1 | 3 | 7>(3);
  const [notes, setNotes] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [nextFree, setNextFree] = useState<number | null>(null);
  const [saved, setSaved] = useState<Transaction | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const checkTimer = useRef<number | undefined>(undefined);
  const uid = useId();

  // Default reminder lead time comes from Settings → Notifications (§12.6).
  useEffect(() => {
    api.getShopSettings().then(s => setLeadDays(s.notification_settings.reminder_lead_time_days)).catch(() => undefined);
  }, []);

  // Suggest the next free SALE number.
  useEffect(() => {
    if (kind === 'SALE' && !draft?.invoiceNo && !invoiceNo) api.nextSaleInvoiceNo().then(n => setInvoiceNo(String(n))).catch(() => undefined);
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const party = parties.find(p => p.id === partyId);
  const matches = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const list = q ? parties.filter(p => p.name.toLowerCase().includes(q) || p.owner_name?.toLowerCase().includes(q) ||
      (digits.length >= 3 && [p.phone, ...(p.additional_phones ?? [])].some(x => x.includes(digits)))) : parties;
    return list.slice(0, 6);
  }, [parties, partyQuery]);

  // SALE numbers must be unique in the shop: check after typing stops (400 ms).
  useEffect(() => {
    window.clearTimeout(checkTimer.current);
    if (kind !== 'SALE' || !normalizeInvoice(invoiceNo)) { setInvoiceState('idle'); return; }
    setInvoiceState('checking');
    checkTimer.current = window.setTimeout(async () => {
      try {
        const free = await api.isSaleInvoiceFree(invoiceNo);
        setInvoiceState(free ? 'free' : 'used');
        if (!free) setNextFree(await api.nextSaleInvoiceNo());
      } catch { setInvoiceState('idle'); }
    }, 400);
    return () => window.clearTimeout(checkTimer.current);
  }, [invoiceNo, kind]);

  // Party without GSTIN is treated as same-state (§8.6); manual override allowed per bill.
  const partyState = party ? (party.gstin ? party.state_code : shop?.state_code) : shop?.state_code;
  const gstBp = Math.round((parseFloat(gstPercent) || 0) * 100);
  const preview = useMemo(() => {
    const rows = items.map(i => ({ name: i.name, qty: parseInt(i.qty, 10) || 0, rate: toPaise(i.rate) ?? 0 }));
    const target = taxOverride === 'INTER' ? '__other__' : taxOverride === 'INTRA' ? shop?.state_code : partyState;
    return computeTax(rows, gstBp, shop?.state_code ?? '', target);
  }, [items, gstBp, partyState, shop, taxOverride]);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const setItem = (i: number, patch: Partial<DraftItem>) => setItems(prev => prev.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const choose = (p: Party) => {
    setPartyId(p.id);
    setPartyQuery('');
    if (kinds.includes(KIND_FOR_PARTY[p.type])) setKind(KIND_FOR_PARTY[p.type]);
  };

  const reset = () => {
    setSaved(null); setPdfUrl(null); setItems([emptyItem()]); setInvoiceNo(''); setNotes(''); setRemindOn('');
    setTaxOverride(''); setErrors({}); setFormError(null); setBillDate(todayIST());
    if (kind === 'SALE') api.nextSaleInvoiceNo().then(n => setInvoiceNo(String(n))).catch(() => undefined);
  };

  const save = async () => {
    const errs: Record<string, string> = {};
    if (!partyId) errs.party_id = t('pick_party');
    if (!normalizeInvoice(invoiceNo)) errs.invoice_no = t('required');
    if (kind === 'SALE' && invoiceState === 'used') errs.invoice_no = t('bill_no_used');
    const clean = items.filter(i => i.name.trim() || i.rate.trim());
    if (!clean.length) errs.items = t('required');
    clean.forEach((it, i) => {
      if (!it.name.trim()) errs[`items.${i}.name`] = t('required');
      if (!(parseInt(it.qty, 10) > 0)) errs[`items.${i}.qty`] = t('required');
      if (toPaise(it.rate) === null) errs[`items.${i}.rate`] = t('required');
    });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setFormError(null);
    try {
      const res = await api.createBill({
        kind, party_id: partyId, invoice_no: invoiceNo, bill_date: billDate, gst_bp: gstBp,
        tax_mode_override: taxOverride || null,
        items: clean.map(i => ({ name: i.name.trim(), qty: parseInt(i.qty, 10), rate: toPaise(i.rate)! })),
        remind_on: remindOn || null, remind_lead_days: remindOn ? leadDays : null,
        notes: notes.trim() || null, source: draft?.items?.length ? 'SCAN' : 'MANUAL'
      });
      setSaved(res.transaction);
      onSaved?.(res.transaction);
      if (shop) setPdfUrl(await billPdfUrl(shop, res.transaction));
    } catch (e) {
      if (e instanceof ApiError) {
        setFormError(e.message);
        if (e.fields) setErrors(e.fields);
        if (e.code === 'DUPLICATE_INVOICE') { setInvoiceState('used'); setNextFree(await api.nextSaleInvoiceNo()); }
      } else {
        console.error('Saving the bill failed', e);
        setFormError(navigator.onLine ? t('error_generic') : t('error_offline'));
      }
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full h-12 px-3 rounded-xl border-2 border-slate-200 bg-white text-base text-slate-900 focus:border-indigo-600 focus:outline-none';
  const err = (k: string) => errors[k] && <p className="mt-1 text-sm text-rose-600">{errors[k]}</p>;
  const rs = (p: number) => formatPaiseToINR(p, true);

  // ---------- after saving: open the bill PDF + share actions ----------
  if (saved) {
    return (
      <div className="p-4 sm:p-6 space-y-4" data-no-swipe>
        <div className="text-center">
          <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-600" />
          <p className="text-xl font-bold">{t('bill_saved')}</p>
          <p className="text-base text-slate-700">{saved.party_name} · #{saved.invoice_number} · <b>{rs(saved.grand_total_paise)}</b></p>
        </div>
        {pdfUrl && <object data={pdfUrl} type="application/pdf" className="w-full h-96 rounded-xl border border-slate-200" aria-label="Bill PDF" />}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => shop && openBillPdf(shop, saved)} className="h-14 rounded-2xl bg-indigo-700 text-white text-base font-bold flex items-center justify-center gap-2">
            <FileText className="w-5 h-5" /> {t('share_pdf')}
          </button>
          <button onClick={() => shop && shareBillPdf(shop, saved).catch(e => setFormError(e.message))}
            className="h-14 rounded-2xl border-2 border-indigo-300 text-indigo-800 text-base font-bold flex items-center justify-center gap-2">
            <Share2 className="w-5 h-5" /> {t('share')}
          </button>
          {party?.phone && (
            <button onClick={() => openWhatsApp(party.phone, billMessage(shop?.name ?? '', saved))}
              className="col-span-2 h-14 rounded-2xl bg-[#25D366] text-white text-base font-bold flex items-center justify-center gap-2">
              <MessageCircle className="w-6 h-6" /> {t('share_whatsapp')}
            </button>
          )}
          <button onClick={reset} className="h-14 rounded-2xl border-2 border-slate-300 text-base font-bold">{t('new_bill')}</button>
          {onDone && <button onClick={onDone} className="h-14 rounded-2xl border-2 border-slate-300 text-base font-bold">{t('done')}</button>}
        </div>
        {formError && <p className="text-base text-rose-700">{formError}</p>}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {formError && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-base flex gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /> {formError}
        </div>
      )}
      {onScan && !draft?.items?.length && (
        <button type="button" onClick={onScan} className="w-full h-12 rounded-xl border-2 border-indigo-300 bg-indigo-50 text-indigo-800 text-base font-bold flex items-center justify-center gap-2">
          <Camera className="w-5 h-5" /> {t('scan_bill')}
        </button>
      )}
      {!!draft?.items?.length && <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-base text-amber-900">{t('filled_from_scan')}</p>}

      {kinds.length > 1 && (
        <div className={`grid gap-2 ${kinds.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {kinds.map(k => {
            const { icon: Icon, on } = KIND_UI[k];
            return (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={`min-h-[72px] rounded-2xl border-2 p-2 flex flex-col items-center justify-center gap-1 ${kind === k ? on : 'border-slate-200 text-slate-600'}`}>
                <Icon className="w-7 h-7" /><span className="text-base font-bold">{t(`kind_${k}`)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Party: the only party search on this form */}
      <div>
        <label className="block text-base font-semibold text-slate-800 mb-1">{t('pick_party')}</label>
        {party ? (
          <button type="button" onClick={() => setPartyId('')} className="w-full min-h-12 px-3 py-2 rounded-xl border-2 border-indigo-600 bg-indigo-50 text-left">
            <span className="block text-base font-bold text-slate-900">{party.name}</span>
            <span className="block text-sm text-slate-600">{party.owner_name} · {party.phone}{party.gstin ? ` · ${party.gstin}` : ''}</span>
            <span className="block text-sm text-slate-600">
              {t('state')}: {getStateByCode(partyState ?? '')?.name ?? '—'} ({partyState}) · {preview.taxMode === 'INTRA' ? t('same_state') : t('other_state')}
            </span>
          </button>
        ) : (
          <>
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-3.5 text-slate-400" />
              <input value={partyQuery} onChange={e => setPartyQuery(e.target.value)} placeholder={t('search_party')} className={`${field} pl-10`} />
            </div>
            <div className="mt-2 rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {matches.map(p => (
                <button key={p.id} type="button" onClick={() => choose(p)} className="w-full min-h-12 px-3 py-2 text-left hover:bg-slate-50">
                  <span className="block text-base font-semibold text-slate-900">{p.name}</span>
                  <span className="block text-sm text-slate-500">{p.phone}</span>
                </button>
              ))}
              {!matches.length && <p className="px-3 py-3 text-base text-slate-500">{t('no_party_found')}</p>}
              {onNewParty && (
                <button type="button" onClick={onNewParty} className="w-full min-h-12 px-3 text-left text-base font-bold text-indigo-700 flex items-center gap-2">
                  <UserPlus className="w-5 h-5" /> {t('add_new_party')}
                </button>
              )}
            </div>
          </>
        )}
        {err('party_id')}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${uid}-bill-no`} className="block text-base font-semibold text-slate-800 mb-1">{t('bill_no')}</label>
          <input id={`${uid}-bill-no`} inputMode="numeric" value={invoiceNo}
            onChange={e => setInvoiceNo(e.target.value.replace(/\D/g, ''))}
            onPaste={e => { e.preventDefault(); setInvoiceNo((invoiceNo + e.clipboardData.getData('text')).replace(/\D/g, '')); }}
            onBlur={() => { const n = normalizeInvoice(invoiceNo); setInvoiceNo(n ? String(n) : invoiceNo.replace(/^0+/, '')); }}
            className={`${field} font-mono ${invoiceState === 'used' ? 'border-rose-500' : ''}`} />
          {invoiceState === 'used' && (
            <p className="mt-1 text-sm text-rose-600">{t('bill_no_used')}{nextFree && <> · <button type="button" className="underline font-semibold" onClick={() => setInvoiceNo(String(nextFree))}>{t('use_next_no')}: {nextFree}</button></>}</p>
          )}
          {invoiceState === 'free' && <p className="mt-1 text-sm text-emerald-700">{t('bill_no_free')}</p>}
          {err('invoice_no')}
        </div>
        <div>
          <label htmlFor={`${uid}-bill-date`} className="block text-base font-semibold text-slate-800 mb-1">{t('date')}</label>
          <input id={`${uid}-bill-date`} type="date" value={billDate} max={todayIST()} onChange={e => setBillDate(e.target.value)} className={field} />
        </div>
      </div>

      <div>
        <p className="text-base font-semibold text-slate-800 mb-2">{t('items')}</p>
        <div className="space-y-3">
          {items.map((it, i) => {
            const line = (parseInt(it.qty, 10) || 0) * (toPaise(it.rate) ?? 0);
            return (
              <div key={i} className="rounded-2xl border-2 border-slate-200 p-3 space-y-2">
                <div className="flex gap-2">
                  <input value={it.name} onChange={e => setItem(i, { name: e.target.value })} placeholder={t('item_name_ph')} aria-label={t('item_name')} className={field} />
                  {items.length > 1 && (
                    <button type="button" aria-label={t('remove_item')} onClick={() => setItems(items.filter((_, k) => k !== i))}
                      className="w-12 h-12 shrink-0 rounded-xl border-2 border-slate-200 text-slate-500 flex items-center justify-center"><Trash2 className="w-5 h-5" /></button>
                  )}
                </div>
                {err(`items.${i}.name`)}
                <div className="grid grid-cols-3 gap-2 items-end">
                  <label className="text-sm text-slate-600">{t('qty')}
                    <input inputMode="numeric" value={it.qty} onChange={e => setItem(i, { qty: e.target.value.replace(/\D/g, '') })} className={field} />
                  </label>
                  <label className="text-sm text-slate-600">{t('rate')}
                    <input inputMode="decimal" value={it.rate} onChange={e => setItem(i, { rate: e.target.value.replace(/[^\d.]/g, '') })} className={field} />
                  </label>
                  <div className="text-right">
                    <span className="block text-sm text-slate-600">{t('line_total')}</span>
                    <span className="block h-12 leading-[3rem] text-sm sm:text-base font-bold text-slate-900 break-all">{rs(line)}</span>
                  </div>
                </div>
                {(errors[`items.${i}.qty`] || errors[`items.${i}.rate`]) && <p className="text-sm text-rose-600">{t('required')}</p>}
              </div>
            );
          })}
        </div>
        {err('items')}
        <button type="button" onClick={() => setItems([...items, emptyItem()])}
          className="mt-3 w-full h-12 rounded-xl border-2 border-dashed border-indigo-400 text-indigo-700 text-base font-bold flex items-center justify-center gap-2">
          <Plus className="w-5 h-5" /> {t('add_item')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-base font-semibold text-slate-800">{t('gst_rate')}
          <select value={gstPercent} onChange={e => setGstPercent(e.target.value)} className={field}>
            {['0', '5', '12', '18', '28'].map(v => <option key={v} value={v}>{v}%</option>)}
          </select>
        </label>
        <label className="text-base font-semibold text-slate-800">{t('gst')}
          <select value={taxOverride} onChange={e => setTaxOverride(e.target.value as any)} className={field}>
            <option value="">{t('tax_auto')}</option>
            <option value="INTRA">{t('same_state')}</option>
            <option value="INTER">{t('other_state')}</option>
          </select>
        </label>
      </div>

      <button type="button" onClick={() => setShowMore(!showMore)} className="w-full h-12 rounded-xl bg-slate-100 text-slate-700 text-base font-semibold flex items-center justify-center gap-2">
        {showMore ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />} {showMore ? t('less') : t('more')}
      </button>
      {showMore && (
        <div className="space-y-4 rounded-2xl border-2 border-slate-200 p-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-base font-semibold text-slate-800">{t('remind_on')}
              <input type="date" value={remindOn} min={billDate} onChange={e => setRemindOn(e.target.value)} className={field} />
            </label>
            <label className="text-base font-semibold text-slate-800">{t('remind_before')}
              <select value={leadDays} onChange={e => setLeadDays(Number(e.target.value) as 0 | 1 | 3 | 7)} className={field} disabled={!remindOn}>
                <option value={0}>{t('on_the_day')}</option>
                <option value={1}>{t('one_day_before')}</option>
                <option value={3}>{t('days_before', { n: 3 })}</option>
                <option value={7}>{t('days_before', { n: 7 })}</option>
              </select>
            </label>
          </div>
          <label className="block text-base font-semibold text-slate-800">{t('notes')}
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={`${field} h-auto py-2`} />
          </label>
        </div>
      )}

      <div className="rounded-2xl bg-slate-900 text-white p-4 space-y-1">
        <div className="flex justify-between text-base text-slate-300"><span>{t('items_total')}</span><span>{rs(preview.subtotal)}</span></div>
        {preview.taxMode === 'INTRA' ? (
          <>
            <div className="flex justify-between text-base text-slate-300"><span>CGST {Number(gstPercent) / 2}%</span><span>{rs(preview.cgst)}</span></div>
            <div className="flex justify-between text-base text-slate-300"><span>SGST {Number(gstPercent) / 2}%</span><span>{rs(preview.sgst)}</span></div>
          </>
        ) : (
          <div className="flex justify-between text-base text-slate-300"><span>IGST {gstPercent}%</span><span>{rs(preview.igst)}</span></div>
        )}
        <div className="flex justify-between items-baseline pt-2 border-t border-slate-700">
          <span className="text-lg font-semibold">{t('bill_total')}</span>
          <span className="text-3xl font-bold">{rs(preview.grandTotal)}</span>
        </div>
      </div>

      <button type="button" onClick={save} disabled={busy}
        className="w-full h-14 rounded-2xl bg-indigo-700 text-white text-lg font-bold flex items-center justify-center gap-2 disabled:opacity-60">
        {busy ? <><Loader2 className="w-6 h-6 animate-spin" /> {t('saving')}</> : t('save_bill')}
      </button>
    </div>
  );
};
