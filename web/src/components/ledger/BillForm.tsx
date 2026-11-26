import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ShoppingBag, Truck, Scissors, Loader2, CheckCircle2, ChevronDown, ChevronUp, MessageCircle, AlertTriangle, Search, UserPlus, Camera, FileText, Share2, X } from 'lucide-react';
import { BillKind, Party, Transaction, computeTax, formatPaiseToINR, getStateByCode, normalizeInvoice } from '@yorbalance/shared';
import { api, ApiError } from '../../lib/api';
import { cache } from '../../lib/data/cache';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { todayIST } from '../../lib/data/util';
import { billMessage, openWhatsApp } from '../../lib/whatsapp';
import { billPdfUrl, openBillPdf, shareBillPdf } from '../../lib/pdf';

/** Validate an HSN code: digits only, 4–8 characters. Returns error string or null. */
function validateHsn(v: string): string | null {
  if (!v) return null; // optional
  if (!/^\d+$/.test(v)) return 'HSN code must contain digits only';
  if (v.length < 4 || v.length > 8) return 'HSN code must be 4–8 digits';
  return null;
}

export interface DraftItem { name: string; qty: string; rate: string; hsnCode?: string }
export interface DraftBill {
  kind: BillKind;
  partyId: string;
  customerName?: string;
  customerPhone?: string;
  invoiceNo: string;
  billDate: string;
  items: DraftItem[];
  gstPercent: string;
  hsnCode?: string;
}

const KIND_FOR_PARTY: Record<Party['type'], BillKind> = { CUSTOMER: 'SALE', SUPPLIER: 'PURCHASE', ARTISAN: 'JOB_WORK' };
const KIND_UI: Record<BillKind, { icon: typeof ShoppingBag; on: string }> = {
  SALE: { icon: ShoppingBag, on: 'border-indigo-600 bg-indigo-50 text-indigo-900' },
  PURCHASE: { icon: Truck, on: 'border-indigo-600 bg-indigo-50 text-indigo-900' },
  JOB_WORK: { icon: Scissors, on: 'border-indigo-600 bg-indigo-50 text-indigo-900' }
};
const emptyItem = (): DraftItem => ({ name: '', qty: '1', rate: '', hsnCode: '' });

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

/** Map bill kind → allowed party types (for filtering the party dropdown for Sold and Bought). */
const ALLOWED_PARTY_TYPES: Record<BillKind, Party['type'][]> = {
  SALE: ['CUSTOMER'],
  PURCHASE: ['SUPPLIER'],
  JOB_WORK: [],
};

/** Searchable Saree Dropdown fed by stock catalog */
const SareeDropdown: React.FC<{
  value: string;
  onChange: (val: string) => void;
  catalog: string[];
  hasError?: boolean;
}> = ({ value, onChange, catalog, hasError }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? catalog.filter(c => c.toLowerCase().includes(q)) : catalog;
  }, [catalog, search]);

  if (customMode) {
    return (
      <div className="flex gap-1.5 items-center">
        <input
          autoFocus
          value={value}
          placeholder="Type saree name"
          onChange={e => onChange(e.target.value)}
          className={`w-full h-[44px] px-3 rounded-[10px] border text-[15px] focus:outline-none ${
            hasError ? 'border-rose-500 bg-rose-50/20' : 'border-indigo-500'
          }`}
        />
        <button
          type="button"
          onClick={() => { setCustomMode(false); setSearch(''); }}
          className="text-xs text-slate-500 hover:text-slate-800 whitespace-nowrap px-2.5 h-[44px] border border-slate-300 rounded-[10px] bg-white shrink-0"
          title="Back to catalog"
        >
          Catalog
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative w-full">
      <div
        onClick={() => { setOpen(prev => !prev); setSearch(''); }}
        className={`w-full h-[44px] px-3 rounded-[10px] border text-[15px] flex items-center justify-between cursor-pointer bg-white transition-colors ${
          hasError ? 'border-rose-500 bg-rose-50/20' : open ? 'border-indigo-600 ring-1 ring-indigo-600' : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <span className={`truncate ${value ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>
          {value || '-- Select Saree --'}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden divide-y divide-slate-100 min-w-[230px]">
          <div className="p-2 bg-slate-50">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search saree..."
                className="w-full h-8 pl-8 pr-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-indigo-600"
              />
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto divide-y divide-slate-50">
            {filtered.map(name => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  onChange(name);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm font-medium hover:bg-indigo-50 hover:text-indigo-900 flex items-center justify-between ${
                  value === name ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-800'
                }`}
              >
                <span className="truncate">{name}</span>
                {value === name && <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />}
              </button>
            ))}

            {filtered.length === 0 && (
              <div className="p-3 text-xs text-slate-500 text-center">
                {catalog.length === 0 ? (
                  <span>
                    No sarees in catalog.{' '}
                    <button
                      type="button"
                      onClick={() => { setCustomMode(true); setOpen(false); }}
                      className="text-indigo-600 font-bold underline ml-1"
                    >
                      Add one
                    </button>
                  </span>
                ) : (
                  <span>No matches found</span>
                )}
              </div>
            )}
          </div>

          <div className="p-1.5 bg-slate-50 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setCustomMode(true);
                setOpen(false);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg text-xs font-bold text-indigo-700 hover:bg-indigo-100/60 flex items-center gap-1.5 justify-center"
            >
              <Plus className="w-3.5 h-3.5" /> Add new item
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const BillForm: React.FC<Props> = ({ parties, kinds = ['SALE', 'PURCHASE', 'JOB_WORK'], partyId: partyProp, onPartyChange, draft, onSaved, onDone, onScan, onNewParty }) => {
  const { shop } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
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
  
  // Job Work customer state (typed directly, walk-in)
  const [customerName, setCustomerName] = useState(draft?.customerName ?? '');
  const [customerPhone, setCustomerPhone] = useState(draft?.customerPhone ?? '');
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);

  const [invoiceNo, setInvoiceNo] = useState(draft?.invoiceNo ?? '');
  const [invoiceState, setInvoiceState] = useState<'idle' | 'checking' | 'free' | 'used'>('idle');
  const [billDate, setBillDate] = useState(draft?.billDate ?? todayIST());
  const [items, setItems] = useState<DraftItem[]>(
    draft?.items?.length
      ? draft.items.map(it => ({ ...it, hsnCode: it.hsnCode ?? draft.hsnCode ?? '' }))
      : [emptyItem()]
  );
  const [gstPercent, setGstPercent] = useState(draft?.gstPercent ?? (initialKind() === 'JOB_WORK' ? '0' : defaultGst));
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
  const [invoicePrefix, setInvoicePrefix] = useState('');
  const [stockWarnings, setStockWarnings] = useState<Record<number, string>>({});
  const [stockCatalog, setStockCatalog] = useState<string[]>([]);
  const [itemHsnMap, setItemHsnMap] = useState<Record<string, string>>({});
  const [openCatalogRow, setOpenCatalogRow] = useState<number | null>(null);
  const [dismissedHsnPrompt, setDismissedHsnPrompt] = useState<Record<number, string>>({});
  const [savingHsnRow, setSavingHsnRow] = useState<number | null>(null);
  const checkTimer = useRef<number | undefined>(undefined);
  const uid = useId();

  // Load Settings and finished saree catalog
  useEffect(() => {
    api.getShopSettings().then(s => {
      setLeadDays(s.notification_settings.reminder_lead_time_days);
      setInvoicePrefix(s.invoice_settings.invoice_prefix ?? '');
      setItemHsnMap(s.app_preferences?.item_hsn_map ?? {});
    }).catch(() => undefined);

    api.getStockTally().then(tally => {
      const names = tally.map(t => t.item_name).filter(Boolean);
      setStockCatalog(Array.from(new Set(names)));
    }).catch(() => undefined);
  }, []);

  // Suggest previous Job work customers (distinct from past Job work bills only)
  const prevJobWorkCustomers = useMemo(() => {
    const list: Array<{ name: string; phone: string }> = [];
    const seen = new Set<string>();
    for (const b of cache.rawBills()) {
      if (b.kind === 'JOB_WORK' && b.party_name) {
        const name = b.party_name.trim();
        const phone = (b.party_phone || b.customer_phone || '').trim();
        const key = `${name.toLowerCase()}|${phone}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({ name, phone });
        }
      }
    }
    return list;
  }, []);

  const matchingSuggestions = useMemo(() => {
    if (!customerName.trim() || !showCustomerSuggestions) return [];
    const q = customerName.trim().toLowerCase();
    return prevJobWorkCustomers.filter(c => c.name.toLowerCase().includes(q) && c.name.toLowerCase() !== q).slice(0, 5);
  }, [prevJobWorkCustomers, customerName, showCustomerSuggestions]);

  // Suggest the next free SALE number.
  useEffect(() => {
    if (kind === 'SALE' && !draft?.invoiceNo && !invoiceNo) api.nextSaleInvoiceNo().then(n => setInvoiceNo(String(n))).catch(() => undefined);
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const party = parties.find(p => p.id === partyId);

  // Filter parties for Sold & Bought
  const allowedTypes = ALLOWED_PARTY_TYPES[kind];
  const filteredParties = useMemo(() => parties.filter(p => allowedTypes.includes(p.type)), [parties, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // Empty state label per kind.
  const noPartyLabel = kind === 'SALE' ? 'No customers found' : kind === 'PURCHASE' ? 'No suppliers found' : 'No customers found';

  // Party search within type-filtered list (max 3 displayed, scrollable).
  const matches = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const list = q ? filteredParties.filter(p => p.name.toLowerCase().includes(q) || p.owner_name?.toLowerCase().includes(q) ||
      (digits.length >= 3 && [p.phone, ...(p.additional_phones ?? [])].some(x => x.includes(digits)))) : filteredParties;
    return list.slice(0, 20);
  }, [filteredParties, partyQuery]);

  // Switch kind helper ensuring proper GST and state defaults
  const switchKind = (k: BillKind) => {
    setKind(k);
    setPartyId('');
    setPartyQuery('');
    setErrors({});
    setFormError(null);
    if (k === 'JOB_WORK') {
      setGstPercent('0');
      setTaxOverride('');
    } else {
      setGstPercent(defaultGst);
    }
  };

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

  // Tax calculation: Job work customers have no GSTIN, treated as same-state unless manually overridden
  const partyState = party?.gstin ? party.state_code : shop?.state_code;
  const gstBp = Math.round((parseFloat(gstPercent) || 0) * 100);
  const preview = useMemo(() => {
    const rows = items.map(i => ({ name: i.name, qty: parseInt(i.qty, 10) || 0, rate: toPaise(i.rate) ?? 0 }));
    const target = taxOverride === 'INTER' ? '__other__' : taxOverride === 'INTRA' ? shop?.state_code : partyState;
    return computeTax(rows, gstBp, shop?.state_code ?? '', target);
  }, [items, gstBp, partyState, shop, taxOverride]);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  // Check stock for Sale & Job Work items: warn if qty exceeds in-hand balance
  useEffect(() => {
    if (kind !== 'SALE' && kind !== 'JOB_WORK') {
      setStockWarnings({});
      return;
    }
    api.getStockTally().then(tally => {
      const warnings: Record<number, string> = {};
      items.forEach((it, idx) => {
        const name = (it.name || '').trim().toLowerCase();
        if (!name) return;
        const match = tally.find(t => t.item_name.toLowerCase() === name);
        const qty = parseInt(it.qty, 10) || 0;
        if (match) {
          if (qty > match.in_hand_balance) {
            warnings[idx] = `Stock warning: Only ${match.in_hand_balance} in hand (selling ${qty} will leave ${match.in_hand_balance - qty})`;
          }
        }
      });
      setStockWarnings(warnings);
    }).catch(() => undefined);
  }, [items, kind]);

  const setItem = (i: number, patch: Partial<DraftItem>) => setItems(prev => prev.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const chooseParty = (p: Party) => {
    setPartyId(p.id);
    setPartyQuery('');
    setErrors(prev => { const n = { ...prev }; delete n.party_id; return n; });
    if (kinds.includes(KIND_FOR_PARTY[p.type])) setKind(KIND_FOR_PARTY[p.type]);
  };

  const reset = () => {
    setSaved(null); setPdfUrl(null); setItems([emptyItem()]); setInvoiceNo(''); setNotes(''); setRemindOn('');
    setCustomerName(''); setCustomerPhone(''); setShowCustomerSuggestions(false);
    setTaxOverride(''); setErrors({}); setFormError(null); setBillDate(todayIST());
    setOpenCatalogRow(null); setDismissedHsnPrompt({});
    if (kind === 'SALE') api.nextSaleInvoiceNo().then(n => setInvoiceNo(String(n))).catch(() => undefined);
  };

  const saveItemHsnMaster = async (rowIdx: number, itemName: string, hsn: string) => {
    const key = itemName.trim().toLowerCase();
    if (!key || !hsn) return;
    setSavingHsnRow(rowIdx);
    try {
      const nextMap = { ...itemHsnMap, [key]: hsn };
      await api.updateAppPreferences({ item_hsn_map: nextMap });
      setItemHsnMap(nextMap);
    } catch {
      /* keep non-blocking if preference save fails */
    } finally {
      setSavingHsnRow(null);
    }
  };

  const save = async () => {
    const errs: Record<string, string> = {};
    if (kind === 'JOB_WORK') {
      if (!customerName.trim()) {
        errs.customer_name = 'Customer name is required';
      }
      const cleanP = customerPhone.replace(/\D/g, '');
      if (cleanP.length !== 10) {
        errs.customer_phone = 'Phone number must be 10 digits';
      }
    } else {
      if (!partyId) {
        errs.party_id = t('pick_party');
      }
    }

    if (!normalizeInvoice(invoiceNo)) {
      errs.invoice_no = t('required');
    }
    if (kind === 'SALE' && invoiceState === 'used') {
      errs.invoice_no = t('bill_no_used');
    }

    if (kind === 'JOB_WORK') {
      if (!items.length) {
        errs.items = 'Add at least one item';
      } else {
        items.forEach((it, i) => {
          if (!it.name.trim()) errs[`items.${i}.name`] = 'Select a saree';
          const q = parseInt(it.qty, 10);
          if (!(q > 0)) errs[`items.${i}.qty`] = 'Quantity must be > 0';
          const r = toPaise(it.rate);
          if (r === null || r < 0) errs[`items.${i}.rate`] = 'Rate must be ≥ 0';
        });
      }
    } else {
      const hasAny = items.some(i => i.name.trim() || i.rate.trim() || (i.hsnCode ?? '').trim());
      if (!hasAny) errs.items = t('required');
      items.forEach((it, i) => {
        const touched = it.name.trim() || it.rate.trim() || (it.hsnCode ?? '').trim() || i === 0;
        if (!touched) return;
        if (!it.name.trim()) errs[`items.${i}.name`] = 'Item name is required';
        const q = parseInt(it.qty, 10);
        if (!(q > 0)) errs[`items.${i}.qty`] = 'Quantity must be > 0';
        const r = toPaise(it.rate);
        if (r === null || r < 0) errs[`items.${i}.rate`] = 'Rate must be ≥ 0';
        const hsnErr = validateHsn((it.hsnCode ?? '').trim());
        if (hsnErr) errs[`items.${i}.hsn_code`] = hsnErr;
      });
    }

    setErrors(errs);
    if (Object.keys(errs).length) {
      setTimeout(() => {
        const first = document.querySelector('[data-error-field]') || document.querySelector('.text-rose-600');
        first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      const itemsToSave = (kind === 'JOB_WORK' ? items : items.filter(i => i.name.trim() || i.rate.trim() || (i.hsnCode ?? '').trim()))
        .map(i => ({
          name: i.name.trim(),
          qty: parseInt(i.qty, 10),
          rate: toPaise(i.rate)!,
          hsn_code: kind !== 'JOB_WORK' && i.hsnCode?.trim() ? i.hsnCode.trim() : null
        }));

      const res = await api.createBill({
        kind,
        party_id: kind === 'JOB_WORK' ? '' : partyId,
        customer_name: kind === 'JOB_WORK' ? customerName.trim() : undefined,
        customer_phone: kind === 'JOB_WORK' ? customerPhone.replace(/\D/g, '').slice(-10) : undefined,
        invoice_no: invoiceNo,
        bill_date: billDate,
        gst_bp: gstBp,
        ...(kind === 'SALE' && invoicePrefix ? { invoice_prefix: invoicePrefix } : {}),
        tax_mode_override: taxOverride || null,
        items: itemsToSave,
        remind_on: remindOn || null,
        remind_lead_days: remindOn ? leadDays : null,
        notes: notes.trim() || null,
        source: draft?.items?.length ? 'SCAN' : 'MANUAL'
      });
      setSaved(res.transaction);
      onSaved?.(res.transaction);
      if (shop) setPdfUrl(await billPdfUrl(shop, res.transaction));
    } catch (e: any) {
      let msg = 'Failed to save bill';
      if (e instanceof ApiError) {
        msg = e.message;
        setFormError(e.message);
        if (e.fields) setErrors(e.fields);
        if (e.code === 'DUPLICATE_INVOICE') { setInvoiceState('used'); setNextFree(await api.nextSaleInvoiceNo()); }
      } else {
        console.error('Saving the bill failed', e);
        msg = navigator.onLine ? (e?.message || t('error_generic')) : t('error_offline');
        setFormError(msg);
      }
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 50);
    } finally {
      setBusy(false);
    }
  };

  const inputCls = (hasErr?: boolean) =>
    `w-full h-[44px] px-3 rounded-[10px] border ${
      hasErr ? 'border-rose-500 bg-rose-50/20' : 'border-[#9CA3AF] bg-white'
    } text-[15px] text-slate-900 focus:border-indigo-600 focus:outline-none transition-colors`;

  const err = (k: string) => errors[k] && <p className="mt-1 text-xs text-rose-600 font-medium">{errors[k]}</p>;
  const rs = (p: number) => formatPaiseToINR(p, true);

  // ---------- after saving: open the bill PDF + share actions ----------
  if (saved) {
    const savedBillNo = saved.invoice_prefix ? `${saved.invoice_prefix}${saved.invoice_number}` : saved.invoice_number;
    const targetPhone = kind === 'JOB_WORK' ? customerPhone : party?.phone;
    return (
      <div className="w-full space-y-4 box-border min-w-0" data-no-swipe>
        <div className="text-center">
          <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-600" />
          <p className="text-xl font-bold">{t('bill_saved')}</p>
          <p className="text-base text-slate-700">{saved.party_name} · #{savedBillNo} · <b>{rs(saved.grand_total_paise)}</b></p>
          {(saved.type === 'PURCHASE' || saved.type === 'SALE') && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-800">
              <span>
                Stock updated: {saved.type === 'PURCHASE' ? '+' : '-'}{(saved.items ?? []).reduce((s, it) => s + it.quantity, 0)} sarees
                {saved.items?.[0]?.item_name ? ` (${saved.items[0].item_name}${saved.items.length > 1 ? ` +${saved.items.length - 1} more` : ''})` : ''}
              </span>
              <button
                type="button"
                onClick={() => navigate('/stock')}
                className="text-indigo-700 font-bold underline hover:text-indigo-900"
              >
                View in Finished Stock
              </button>
            </div>
          )}
        </div>
        {pdfUrl && <object data={pdfUrl} type="application/pdf" className="w-full h-96 rounded-xl border border-slate-200" aria-label="Bill PDF" />}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => shop && openBillPdf(shop, saved)} className="h-14 rounded-2xl bg-indigo-700 hover:bg-indigo-800 text-white text-base font-bold flex items-center justify-center gap-2 transition-colors">
            <FileText className="w-5 h-5" /> Print / Share PDF
          </button>
          <button onClick={() => shop && shareBillPdf(shop, saved).catch(e => setFormError(e.message))}
            className="h-14 rounded-2xl border-2 border-indigo-300 text-indigo-800 text-base font-bold flex items-center justify-center gap-2">
            <Share2 className="w-5 h-5" /> {t('share')}
          </button>
          {targetPhone && (
            <button onClick={() => openWhatsApp(targetPhone, billMessage(shop?.name ?? '', saved))}
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

  const totalSarees = items.reduce((sum, it) => sum + (parseInt(it.qty, 10) || 0), 0);

  return (
    <div className="w-full space-y-5 box-border min-w-0">
      {formError && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex gap-2 items-center justify-between">
          <div className="flex gap-2 items-center">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
            <span>{formError}</span>
          </div>
          <button type="button" onClick={() => setFormError(null)} className="text-rose-500 hover:text-rose-800 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {onScan && !draft?.items?.length && (
        <button type="button" onClick={onScan} className="w-full h-[44px] rounded-[10px] border-2 border-indigo-300 bg-indigo-50 text-indigo-800 text-base font-bold flex items-center justify-center gap-2">
          <Camera className="w-5 h-5" /> {t('scan_bill')}
        </button>
      )}
      {!!draft?.items?.length && <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">{t('filled_from_scan')}</p>}

      {kinds.length > 1 && (
        <div className={`grid gap-2 min-w-0 ${kinds.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {kinds.map(k => {
            const { icon: Icon, on } = KIND_UI[k];
            return (
              <button key={k} type="button" onClick={() => switchKind(k)}
                className={`min-h-[56px] rounded-2xl border-2 p-2 flex flex-col items-center justify-center gap-1 transition-all min-w-0 ${
                  kind === k ? on : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}>
                <Icon className="w-5 h-5 shrink-0" /><span className="text-sm sm:text-base font-bold truncate">{t(`kind_${k}`)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Customer / Party Details */}
      {kind === 'JOB_WORK' ? (
        /* Job Work: Customer Name & 10-digit Phone typed directly */
        <div className="space-y-3 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 min-w-0">
            <div className="sm:col-span-2 relative min-w-0" data-error-field={errors.customer_name ? 'customer_name' : undefined}>
              <label className="block text-sm font-bold text-slate-900 mb-1">Customer name *</label>
              <input
                value={customerName}
                onFocus={() => setShowCustomerSuggestions(true)}
                onChange={e => {
                  setCustomerName(e.target.value);
                  setShowCustomerSuggestions(true);
                  setErrors(prev => { const n = { ...prev }; delete n.customer_name; return n; });
                }}
                placeholder="e.g. Ramesh Reddy"
                className={inputCls(!!errors.customer_name)}
              />
              <p className="mt-1 text-xs text-slate-500">Type the name. No need to add them in Parties.</p>
              {matchingSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden divide-y divide-slate-100">
                  <div className="px-3 py-1.5 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">Previous customers</div>
                  {matchingSuggestions.map((cust, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setCustomerName(cust.name);
                        setCustomerPhone(cust.phone);
                        setShowCustomerSuggestions(false);
                        setErrors(prev => { const n = { ...prev }; delete n.customer_name; delete n.customer_phone; return n; });
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center justify-between"
                    >
                      <span className="font-semibold text-slate-800">{cust.name}</span>
                      <span className="text-xs text-slate-500 font-mono">{cust.phone}</span>
                    </button>
                  ))}
                </div>
              )}
              {err('customer_name')}
            </div>

            <div className="sm:col-span-1 min-w-0" data-error-field={errors.customer_phone ? 'customer_phone' : undefined}>
              <label className="block text-sm font-bold text-slate-900 mb-1">Phone number *</label>
              <input
                inputMode="numeric"
                maxLength={10}
                value={customerPhone}
                onChange={e => {
                  setCustomerPhone(e.target.value.replace(/\D/g, ''));
                  setErrors(prev => { const n = { ...prev }; delete n.customer_phone; return n; });
                }}
                placeholder="10-digit mobile number"
                className={`${inputCls(!!errors.customer_phone)} font-mono`}
              />
              {err('customer_phone')}
            </div>
          </div>
        </div>
      ) : (
        /* Sale / Purchase: customer / supplier from Parties */
        <div data-error-field={errors.party_id ? 'party_id' : undefined}>
          <label className="block text-sm font-bold text-slate-900 mb-1">{t('pick_party')}</label>
          {party ? (
            <button type="button" onClick={() => setPartyId('')} className="w-full min-h-[44px] px-3 py-2 rounded-[10px] border border-indigo-600 bg-indigo-50 text-left">
              <span className="block text-base font-bold text-slate-900">{party.name}</span>
              <span className="block text-xs text-slate-600">{party.owner_name} · {party.phone}{party.gstin ? ` · ${party.gstin}` : ''}</span>
              <span className="block text-xs text-slate-600">
                {t('state')}: {getStateByCode(partyState ?? '')?.name ?? '—'} ({partyState}) · {preview.taxMode === 'INTRA' ? t('same_state') : t('other_state')}
              </span>
            </button>
          ) : (
            <>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                <input value={partyQuery} onChange={e => setPartyQuery(e.target.value)} placeholder={t('search_party')} className={`${inputCls(!!errors.party_id)} pl-9`} />
              </div>
              <div className="mt-2 rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden" style={{ maxHeight: '168px', overflowY: 'auto' }}>
                {matches.map(p => (
                  <button key={p.id} type="button" onClick={() => chooseParty(p)} className="w-full min-h-14 px-3 py-2 text-left hover:bg-slate-50 flex flex-col justify-center">
                    <span className="block text-sm font-semibold text-slate-900">{p.name}</span>
                    <span className="block text-xs text-slate-500">{p.phone}</span>
                  </button>
                ))}
                {!matches.length && <p className="px-3 py-3 text-sm text-slate-500">{noPartyLabel}</p>}
                {onNewParty && (
                  <button type="button" onClick={onNewParty} className="w-full min-h-12 px-3 text-left text-sm font-bold text-indigo-700 flex items-center gap-2">
                    <UserPlus className="w-4 h-4" /> {t('add_new_party')}
                  </button>
                )}
              </div>
            </>
          )}
          {err('party_id')}
        </div>
      )}

      {/* Bill number & date */}
      <div className="grid grid-cols-2 gap-3 min-w-0">
        <div className="min-w-0" data-error-field={errors.invoice_no ? 'invoice_no' : undefined}>
          <label htmlFor={`${uid}-bill-no`} className="block text-sm font-bold text-slate-900 mb-1">{t('bill_no')}</label>
          {kind === 'SALE' && invoicePrefix ? (
            <div className={`flex rounded-[10px] border overflow-hidden ${invoiceState === 'used' || errors.invoice_no ? 'border-rose-500' : 'border-[#9CA3AF]'} focus-within:border-indigo-600`}>
              <span className="flex items-center px-3 bg-slate-100 text-slate-600 text-[15px] font-mono select-none shrink-0 border-r border-[#9CA3AF]">{invoicePrefix}</span>
              <input id={`${uid}-bill-no`} inputMode="numeric" value={invoiceNo}
                onChange={e => setInvoiceNo(e.target.value.replace(/\D/g, ''))}
                onPaste={e => { e.preventDefault(); setInvoiceNo((invoiceNo + e.clipboardData.getData('text')).replace(/\D/g, '')); }}
                onBlur={() => { const n = normalizeInvoice(invoiceNo); setInvoiceNo(n ? String(n) : invoiceNo.replace(/^0+/, '')); }}
                className="flex-1 h-[44px] px-3 bg-white text-[15px] text-slate-900 font-mono focus:outline-none" />
            </div>
          ) : (
            <input id={`${uid}-bill-no`} inputMode="numeric" value={invoiceNo}
              onChange={e => setInvoiceNo(e.target.value.replace(/\D/g, ''))}
              onPaste={e => { e.preventDefault(); setInvoiceNo((invoiceNo + e.clipboardData.getData('text')).replace(/\D/g, '')); }}
              onBlur={() => { const n = normalizeInvoice(invoiceNo); setInvoiceNo(n ? String(n) : invoiceNo.replace(/^0+/, '')); }}
              className={`${inputCls(invoiceState === 'used' || !!errors.invoice_no)} font-mono`} />
          )}
          {invoiceState === 'used' && (
            <p className="mt-1 text-xs text-rose-600">{t('bill_no_used')}{nextFree && <> · <button type="button" className="underline font-semibold" onClick={() => setInvoiceNo(String(nextFree))}>{t('use_next_no')}: {nextFree}</button></>}</p>
          )}
          {invoiceState === 'free' && <p className="mt-1 text-xs text-emerald-700">{t('bill_no_free')}</p>}
          {err('invoice_no')}
        </div>
        <div className="min-w-0">
          <label htmlFor={`${uid}-bill-date`} className="block text-sm font-bold text-slate-900 mb-1">{t('date')}</label>
          <input id={`${uid}-bill-date`} type="date" value={billDate} max={todayIST()} onChange={e => setBillDate(e.target.value)} className={inputCls(false)} />
        </div>
      </div>

      {/* Items Section */}
      {kind === 'JOB_WORK' ? (
        <div data-error-field={errors.items ? 'items' : undefined} className="space-y-3 min-w-0">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900">Sarees sold</h3>
              <p className="text-xs text-slate-500 truncate">Pick a saree, then enter quantity and rate per saree.</p>
            </div>
            <div className="shrink-0 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full whitespace-nowrap">
              Total sarees: {totalSarees}
            </div>
          </div>

          {/* Items card with header and item rows */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 box-border min-w-0">
            {/* Header row */}
            <div className="jw-head pb-2 border-b border-slate-200 text-xs uppercase font-bold text-slate-600">
              <div className="text-center">#</div>
              <div className="min-w-0">Saree name</div>
              <div className="text-right">Qty</div>
              <div className="text-right">Rate (₹)</div>
              <div className="text-right">Amount (₹)</div>
              <div className="w-[36px]"></div>
            </div>

            {/* Item rows */}
            <div className="space-y-2 pt-1">
              {items.map((it, i) => {
                const qty = parseInt(it.qty, 10) || 0;
                const rateP = toPaise(it.rate) ?? 0;
                const line = qty * rateP;

                return (
                  <div key={i} className="jw-row">
                    {/* # */}
                    <div className="jw-row-num text-center font-bold text-slate-400 text-xs pt-3">
                      {i + 1}
                    </div>

                    {/* Saree name */}
                    <div className="jw-col-name min-w-0" data-error-field={errors[`items.${i}.name`] ? `items.${i}.name` : undefined}>
                      <SareeDropdown
                        value={it.name}
                        onChange={val => {
                          setItem(i, { name: val });
                          setErrors(prev => {
                            const n = { ...prev };
                            delete n[`items.${i}.name`];
                            delete n.items;
                            return n;
                          });
                        }}
                        catalog={stockCatalog}
                        hasError={!!errors[`items.${i}.name`]}
                      />
                      {errors[`items.${i}.name`] && <p className="text-xs text-rose-600 mt-1">{errors[`items.${i}.name`]}</p>}
                      {stockWarnings[i] && (
                        <div className="mt-1 flex items-center gap-1.5 px-2 py-1 rounded bg-amber-50 border border-amber-300 text-xs text-amber-900">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>{stockWarnings[i]}</span>
                        </div>
                      )}
                    </div>

                    {/* Qty */}
                    <div className="jw-col-qty min-w-0" data-error-field={errors[`items.${i}.qty`] ? `items.${i}.qty` : undefined}>
                      <span className="jw-field-label text-xs uppercase font-bold text-slate-600 mb-1">Qty</span>
                      <input
                        inputMode="numeric"
                        value={it.qty}
                        onChange={e => {
                          setItem(i, { qty: e.target.value.replace(/\D/g, '') });
                          setErrors(prev => {
                            const n = { ...prev };
                            delete n[`items.${i}.qty`];
                            delete n.items;
                            return n;
                          });
                        }}
                        className={`w-full h-[44px] px-2 text-[15px] text-right font-medium rounded-[10px] border ${
                          errors[`items.${i}.qty`] ? 'border-rose-500 bg-rose-50/20' : 'border-[#9CA3AF] bg-white'
                        } focus:border-indigo-600 focus:outline-none`}
                      />
                      {errors[`items.${i}.qty`] && <p className="text-xs text-rose-600 text-right mt-1">{errors[`items.${i}.qty`]}</p>}
                    </div>

                    {/* Rate */}
                    <div className="jw-col-rate min-w-0" data-error-field={errors[`items.${i}.rate`] ? `items.${i}.rate` : undefined}>
                      <span className="jw-field-label text-xs uppercase font-bold text-slate-600 mb-1">Rate (₹)</span>
                      <input
                        inputMode="decimal"
                        value={it.rate}
                        placeholder="0"
                        onChange={e => {
                          setItem(i, { rate: e.target.value.replace(/[^\d.]/g, '') });
                          setErrors(prev => {
                            const n = { ...prev };
                            delete n[`items.${i}.rate`];
                            delete n.items;
                            return n;
                          });
                        }}
                        className={`w-full h-[44px] px-2 text-[15px] text-right font-medium rounded-[10px] border ${
                          errors[`items.${i}.rate`] ? 'border-rose-500 bg-rose-50/20' : 'border-[#9CA3AF] bg-white'
                        } focus:border-indigo-600 focus:outline-none`}
                      />
                      {errors[`items.${i}.rate`] && <p className="text-xs text-rose-600 text-right mt-1">{errors[`items.${i}.rate`]}</p>}
                    </div>

                    {/* Amount */}
                    <div className="jw-col-amount min-w-0">
                      <span className="jw-field-label text-xs uppercase font-bold text-slate-600 mb-1">Amount (₹)</span>
                      <div className="w-full h-[44px] px-2 flex items-center justify-end font-bold text-slate-900 text-[15px] select-none truncate">
                        {rs(line)}
                      </div>
                    </div>

                    {/* Remove */}
                    <div className="jw-col-remove flex items-center justify-end">
                      {items.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setItems(items.filter((_, k) => k !== i))}
                          className="w-[36px] h-[44px] flex items-center justify-center rounded-[10px] text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          aria-label="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <div className="w-[36px] h-[44px]" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {err('items')}

          {/* Button: + Add another saree */}
          <button
            type="button"
            onClick={() => setItems([...items, emptyItem()])}
            className="w-full h-[44px] rounded-[10px] border-2 border-dashed border-indigo-400 text-indigo-700 text-sm font-bold flex items-center justify-center gap-2 hover:bg-indigo-50/50 transition-colors"
          >
            <Plus className="w-4 h-4" /> + Add another saree
          </button>
        </div>
      ) : (
        /* Regular items for Sold / Bought (with per-row HSN / SAC) */
        <div data-error-field={errors.items ? 'items' : undefined} className="min-w-0">
          <p className="text-sm font-bold text-slate-900 mb-2">{t('items')}</p>
          <div className="space-y-3">
            {items.map((it, i) => {
              const line = (parseInt(it.qty, 10) || 0) * (toPaise(it.rate) ?? 0);
              const trimmedName = it.name.trim();
              const itemKey = trimmedName.toLowerCase();
              const isCatalogItem = trimmedName.length > 0 && stockCatalog.some(c => c.toLowerCase() === itemKey);
              const catalogSavedHsn = itemHsnMap[itemKey] ?? '';
              const currentHsn = (it.hsnCode ?? '').trim();
              const inlineHsnErr = errors[`items.${i}.hsn_code`] || (currentHsn ? validateHsn(currentHsn) : null);
              const showSaveHsnPrompt =
                isCatalogItem &&
                currentHsn.length >= 4 &&
                !validateHsn(currentHsn) &&
                currentHsn !== catalogSavedHsn &&
                dismissedHsnPrompt[i] !== currentHsn;
              const catalogMatches = openCatalogRow === i
                ? stockCatalog.filter(c => !trimmedName || c.toLowerCase().includes(itemKey)).slice(0, 6)
                : [];

              return (
                <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-2.5 bg-white min-w-0">
                  {/* Line 1: Item name (full width) + Remove button */}
                  <div className="flex gap-2 items-start min-w-0" data-error-field={errors[`items.${i}.name`] ? `items.${i}.name` : undefined}>
                    <div className="relative flex-1 min-w-0">
                      <input
                        value={it.name}
                        onFocus={() => setOpenCatalogRow(i)}
                        onBlur={() => setTimeout(() => setOpenCatalogRow(prev => (prev === i ? null : prev)), 150)}
                        onChange={e => {
                          setItem(i, { name: e.target.value });
                          setOpenCatalogRow(i);
                          setErrors(prev => { const n = { ...prev }; delete n[`items.${i}.name`]; delete n.items; return n; });
                        }}
                        placeholder={t('item_name_ph')}
                        aria-label={t('item_name')}
                        className={inputCls(!!errors[`items.${i}.name`])}
                      />
                      {catalogMatches.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white rounded-xl border border-slate-200 shadow-lg max-h-44 overflow-y-auto divide-y divide-slate-100">
                          {catalogMatches.map(catName => {
                            const savedHsn = itemHsnMap[catName.toLowerCase()];
                            return (
                              <button
                                key={catName}
                                type="button"
                                onMouseDown={e => {
                                  e.preventDefault();
                                  setItem(i, {
                                    name: catName,
                                    hsnCode: savedHsn ?? it.hsnCode ?? ''
                                  });
                                  setOpenCatalogRow(null);
                                  setErrors(prev => {
                                    const n = { ...prev };
                                    delete n[`items.${i}.name`];
                                    delete n[`items.${i}.hsn_code`];
                                    delete n.items;
                                    return n;
                                  });
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center justify-between gap-2"
                              >
                                <span className="font-medium text-slate-800 truncate">{catName}</span>
                                {savedHsn && <span className="text-xs font-mono text-slate-500 shrink-0">HSN {savedHsn}</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {items.length > 1 && (
                      <button type="button" aria-label={t('remove_item')} onClick={() => setItems(items.filter((_, k) => k !== i))}
                        className="w-[44px] h-[44px] shrink-0 rounded-[10px] border border-[#9CA3AF] text-slate-500 flex items-center justify-center hover:bg-rose-50 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                  {err(`items.${i}.name`)}

                  {/* Line 2: Qty | Price (₹) | HSN / SAC | Total */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-start min-w-0">
                    <div className="min-w-0" data-error-field={errors[`items.${i}.qty`] ? `items.${i}.qty` : undefined}>
                      <label className="block text-xs font-bold uppercase text-slate-600 mb-1">{t('qty')}</label>
                      <input
                        inputMode="numeric"
                        value={it.qty}
                        onChange={e => {
                          setItem(i, { qty: e.target.value.replace(/\D/g, '') });
                          setErrors(prev => { const n = { ...prev }; delete n[`items.${i}.qty`]; delete n.items; return n; });
                        }}
                        className={inputCls(!!errors[`items.${i}.qty`])}
                      />
                      {errors[`items.${i}.qty`] && <p className="mt-1 text-xs text-rose-600 font-medium">{errors[`items.${i}.qty`]}</p>}
                    </div>

                    <div className="min-w-0" data-error-field={errors[`items.${i}.rate`] ? `items.${i}.rate` : undefined}>
                      <label className="block text-xs font-bold uppercase text-slate-600 mb-1">Price (₹)</label>
                      <input
                        inputMode="decimal"
                        value={it.rate}
                        onChange={e => {
                          setItem(i, { rate: e.target.value.replace(/[^\d.]/g, '') });
                          setErrors(prev => { const n = { ...prev }; delete n[`items.${i}.rate`]; delete n.items; return n; });
                        }}
                        className={inputCls(!!errors[`items.${i}.rate`])}
                      />
                      {errors[`items.${i}.rate`] && <p className="mt-1 text-xs text-rose-600 font-medium">{errors[`items.${i}.rate`]}</p>}
                    </div>

                    <div className="min-w-0" data-error-field={inlineHsnErr ? `items.${i}.hsn_code` : undefined}>
                      <label className="block text-xs font-bold uppercase text-slate-600 mb-1">HSN / SAC</label>
                      <input
                        inputMode="numeric"
                        maxLength={8}
                        value={it.hsnCode ?? ''}
                        placeholder="e.g. 5007"
                        onChange={e => {
                          const v = e.target.value.replace(/[^\da-zA-Z]/g, '');
                          setItem(i, { hsnCode: v });
                          setErrors(prev => { const n = { ...prev }; delete n[`items.${i}.hsn_code`]; return n; });
                        }}
                        className={`${inputCls(!!inlineHsnErr)} font-mono`}
                      />
                      {inlineHsnErr ? (
                        <p className="mt-1 text-xs text-rose-600 font-medium">{inlineHsnErr}</p>
                      ) : (
                        <p className="mt-1 text-[11px] text-slate-500">Optional. 4 to 8 digits</p>
                      )}
                      {showSaveHsnPrompt && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg bg-indigo-50 border border-indigo-200 px-2 py-1 text-[11px] text-indigo-900">
                          <span className="font-medium">Save this HSN for the item?</span>
                          <button
                            type="button"
                            disabled={savingHsnRow === i}
                            onClick={() => saveItemHsnMaster(i, trimmedName, currentHsn)}
                            className="px-2 py-0.5 rounded bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-60"
                          >
                            {savingHsnRow === i ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDismissedHsnPrompt(prev => ({ ...prev, [i]: currentHsn }))}
                            className="px-1.5 py-0.5 rounded text-slate-600 hover:bg-indigo-100 font-semibold"
                          >
                            No
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 text-right">
                      <span className="block text-xs font-bold uppercase text-slate-600 mb-1">{t('line_total')}</span>
                      <span className="block h-[44px] leading-[44px] text-[15px] font-bold text-slate-900 truncate">{rs(line)}</span>
                    </div>
                  </div>

                  {stockWarnings[i] && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-xs font-semibold text-amber-900">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>{stockWarnings[i]}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {err('items')}
          <button type="button" onClick={() => setItems([...items, emptyItem()])}
            className="mt-3 w-full h-[44px] rounded-[10px] border-2 border-dashed border-indigo-400 text-indigo-700 text-sm font-bold flex items-center justify-center gap-2 hover:bg-indigo-50/50 transition-colors">
            <Plus className="w-4 h-4" /> {t('add_item')}
          </button>
        </div>
      )}

      {/* GST Settings */}
      <div className="grid grid-cols-2 gap-3 min-w-0">
        <label className="text-sm font-bold text-slate-900">{t('gst_rate')}
          <select
            value={gstPercent}
            onChange={e => setGstPercent(e.target.value)}
            className="w-full h-[44px] px-3 rounded-[10px] border border-[#9CA3AF] bg-white text-[15px] text-slate-900 focus:border-indigo-600 focus:outline-none mt-1"
          >
            {['0', '5', '12', '18', '28'].map(v => <option key={v} value={v}>{v}%</option>)}
          </select>
        </label>
        <label className="text-sm font-bold text-slate-900">{t('gst')}
          {kind === 'JOB_WORK' ? (
            <select
              value={taxOverride || 'INTRA'}
              onChange={e => setTaxOverride(e.target.value as any)}
              className="w-full h-[44px] px-3 rounded-[10px] border border-[#9CA3AF] bg-white text-[15px] text-slate-900 focus:border-indigo-600 focus:outline-none mt-1"
            >
              <option value="INTRA">{t('same_state')}</option>
              <option value="INTER">{t('other_state')}</option>
            </select>
          ) : (
            <select
              value={taxOverride}
              onChange={e => setTaxOverride(e.target.value as any)}
              className="w-full h-[44px] px-3 rounded-[10px] border border-[#9CA3AF] bg-white text-[15px] text-slate-900 focus:border-indigo-600 focus:outline-none mt-1"
            >
              <option value="">{t('tax_auto')}</option>
              <option value="INTRA">{t('same_state')}</option>
              <option value="INTER">{t('other_state')}</option>
            </select>
          )}
        </label>
      </div>

      {kind !== 'JOB_WORK' && (
        <>
          <button type="button" onClick={() => setShowMore(!showMore)} className="w-full h-11 rounded-[10px] bg-slate-100 text-slate-700 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-slate-200 transition-colors">
            {showMore ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />} {showMore ? t('less') : t('more')}
          </button>
          {showMore && (
            <div className="space-y-4 rounded-xl border border-slate-200 p-3 bg-white">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-bold uppercase text-slate-600">{t('remind_on')}
                  <input type="date" value={remindOn} min={billDate} onChange={e => setRemindOn(e.target.value)} className={`${inputCls(false)} mt-1`} />
                </label>
                <label className="text-xs font-bold uppercase text-slate-600">{t('remind_before')}
                  <select value={leadDays} onChange={e => setLeadDays(Number(e.target.value) as 0 | 1 | 3 | 7)} className={`${inputCls(false)} mt-1`} disabled={!remindOn}>
                    <option value={0}>{t('on_the_day')}</option>
                    <option value={1}>{t('one_day_before')}</option>
                    <option value={3}>{t('days_before', { n: 3 })}</option>
                    <option value={7}>{t('days_before', { n: 7 })}</option>
                  </select>
                </label>
              </div>
              <label className="block text-xs font-bold uppercase text-slate-600">{t('notes')}
                <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-3 py-2 rounded-[10px] border border-[#9CA3AF] text-[15px] focus:border-indigo-600 focus:outline-none mt-1" />
              </label>
            </div>
          )}
        </>
      )}

      {/* Bill Totals Preview: dark container */}
      <div className="rounded-2xl bg-slate-900 text-white p-4 space-y-2 shadow-md min-w-0">
        <div className="flex justify-between text-[15px] text-slate-300">
          <span>
            {kind === 'JOB_WORK'
              ? `Items total (${totalSarees} ${totalSarees === 1 ? 'saree' : 'sarees'})`
              : t('items_total')}
          </span>
          <span className="font-medium">{rs(preview.subtotal)}</span>
        </div>
        {preview.taxMode === 'INTRA' ? (
          <>
            <div className="flex justify-between text-[15px] text-slate-300">
              <span>CGST {Number(gstPercent) / 2}%</span>
              <span>{rs(preview.cgst)}</span>
            </div>
            <div className="flex justify-between text-[15px] text-slate-300">
              <span>SGST {Number(gstPercent) / 2}%</span>
              <span>{rs(preview.sgst)}</span>
            </div>
          </>
        ) : (
          <div className="flex justify-between text-[15px] text-slate-300">
            <span>IGST {gstPercent}%</span>
            <span>{rs(preview.igst)}</span>
          </div>
        )}
        <div className="flex justify-between items-baseline pt-2 border-t border-slate-700">
          <span className="text-base font-semibold">{t('bill_total')}</span>
          <span className="text-2xl sm:text-3xl font-bold">{rs(preview.grandTotal)}</span>
        </div>
      </div>

      <button type="button" onClick={save} disabled={busy}
        className="w-full h-14 rounded-2xl bg-indigo-700 hover:bg-indigo-800 text-white text-lg font-bold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors shadow-sm min-w-0">
        {busy ? <><Loader2 className="w-6 h-6 animate-spin" /> {t('saving')}</> : t('save_bill')}
      </button>
    </div>
  );
};
