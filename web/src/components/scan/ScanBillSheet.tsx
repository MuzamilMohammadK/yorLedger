import React, { useRef, useState } from 'react';
import { Camera, ImageUp, Loader2, AlertTriangle, CheckCircle2, UserPlus, ShoppingBag, Truck, Scissors, ChevronDown, ChevronUp } from 'lucide-react';
import { BillKind, Party, ScannedInvoice, computeTax, formatPaiseToINR, matchParty, parseInvoiceText, validateGSTIN } from '@yorbalance/shared';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { readImage } from '../../lib/ocr';
import { Sheet, DraftBill } from '../ledger/NewTransactionModal';
import { PartyFormModal } from '../parties/PartyFormModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  parties: Party[];
  onContinue: (partyId: string | undefined, draft: Partial<DraftBill>) => void;
}

const KINDS: { kind: BillKind; icon: typeof Truck }[] = [
  { kind: 'PURCHASE', icon: Truck }, { kind: 'SALE', icon: ShoppingBag }, { kind: 'JOB_WORK', icon: Scissors }
];
const rupees = (p: number) => (p / 100).toFixed(2).replace(/\.00$/, '');

/** Photo of a bill -> reviewed draft bill. The user always checks before saving. */
export const ScanBillSheet: React.FC<Props> = ({ isOpen, onClose, parties, onContinue }) => {
  const { t } = useI18n();
  const { shop } = useAuth();
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<ScannedInvoice | null>(null);
  const [rawText, setRawText] = useState('');
  const [showText, setShowText] = useState(false);
  const [kind, setKind] = useState<BillKind>('PURCHASE');
  const [partyId, setPartyId] = useState<string | undefined>();
  const [addParty, setAddParty] = useState(false);
  const rs = (p: number) => formatPaiseToINR(p, true);

  if (!isOpen) return null;

  const reset = () => { setPreview(null); setProgress(null); setError(null); setScan(null); setRawText(''); setPartyId(undefined); };
  const close = () => { reset(); onClose(); };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    reset();
    setPreview(URL.createObjectURL(f));
    setProgress(0);
    try {
      const { text } = await readImage(f, 'invoice', setProgress);
      const r = parseInvoiceText(text, shop?.gstin);
      setRawText(text);
      if (!r.gstins.length && !r.items.length && !r.total && !r.invoiceNo) { setError(t('nothing_found')); return; }
      setScan(r);
      setPartyId(matchParty(parties, r)?.party.id);
    } catch (e) {
      console.error('OCR failed', e);
      setError(t('read_fail'));
    } finally {
      setProgress(null);
    }
  };

  const match = scan ? parties.find(p => p.id === partyId) : undefined;
  const newGstin = scan?.gstins[0];

  // Items: what was read, else one line for the taxable value so nothing is lost.
  const gstPct = scan?.gstPercent ?? (shop?.default_gst_bp ?? 500) / 100;
  const items = scan?.items.length
    ? scan.items
    : scan && (scan.taxable ?? scan.total)
      ? [{ name: t('as_per_bill'), qty: 1, rate: scan.taxable ?? Math.round(scan.total! / (1 + gstPct / 100)), amount: 0 }]
      : [];
  const check = items.length
    ? computeTax(items.map(i => ({ name: i.name, qty: i.qty, rate: i.rate })), Math.round(gstPct * 100), '', '').grandTotal
    : 0;
  const mismatch = scan?.total && check && Math.abs(scan.total - check) > 100 ? { a: rs(scan.total), b: rs(check) } : null;

  const proceed = () => {
    if (!scan) return;
    onContinue(partyId, {
      kind,
      invoiceNo: scan.invoiceNo ?? '',
      billDate: scan.date ?? undefined,
      gstPercent: String(gstPct),
      items: items.map(i => ({ name: i.name, qty: String(i.qty), rate: rupees(i.rate) }))
    });
    reset();
  };

  const hidden = (ref: React.RefObject<HTMLInputElement>, capture: boolean) => (
    <input ref={ref} type="file" accept="image/*" {...(capture ? { capture: 'environment' as const } : {})} className="hidden"
      onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
  );

  return (
    <>
      <Sheet title={t('scan_bill')} onClose={close}>
        <div className="p-4 sm:p-6 space-y-5">
          {hidden(camRef, true)}
          {hidden(galRef, false)}

          {!preview && (
            <>
              <p className="text-base text-slate-600">{t('scan_tip')}</p>
              <button onClick={() => camRef.current?.click()} className="w-full h-20 rounded-2xl bg-indigo-700 text-white text-xl font-bold flex items-center justify-center gap-3">
                <Camera className="w-8 h-8" /> {t('take_photo')}
              </button>
              <button onClick={() => galRef.current?.click()} className="w-full h-14 rounded-2xl border-2 border-slate-300 text-lg font-bold text-slate-800 flex items-center justify-center gap-2">
                <ImageUp className="w-6 h-6" /> {t('from_gallery')}
              </button>
            </>
          )}

          {preview && <img src={preview} alt="" className="w-full max-h-64 object-contain rounded-xl bg-slate-100" />}

          {progress !== null && (
            <div className="space-y-2">
              <p className="text-base font-semibold text-slate-700 flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> {t('reading')}</p>
              <div className="h-3 rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            </div>
          )}

          {error && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-base flex gap-2"><AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /> {error}</div>
              <button onClick={() => camRef.current?.click()} className="w-full h-14 rounded-2xl bg-indigo-700 text-white text-lg font-bold">{t('take_photo')}</button>
            </div>
          )}

          {scan && (
            <div className="space-y-4">
              <div>
                <p className="text-base font-semibold text-slate-800 mb-2">{t('which_kind')}</p>
                <div className="grid grid-cols-3 gap-2">
                  {KINDS.map(({ kind: k, icon: Icon }) => (
                    <button key={k} onClick={() => setKind(k)}
                      className={`min-h-[64px] rounded-2xl border-2 flex flex-col items-center justify-center ${kind === k ? 'border-indigo-600 bg-indigo-50 text-indigo-900' : 'border-slate-200 text-slate-600'}`}>
                      <Icon className="w-6 h-6" /><span className="text-base font-bold">{t(`kind_${k}`)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Party: matched, or offer to add the one printed on the bill */}
              {match ? (
                <div className="p-3 rounded-xl bg-emerald-50 border-2 border-emerald-200 flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-emerald-800">{t('found_party')}</p>
                    <p className="text-base font-bold text-slate-900 truncate">{match.name}</p>
                  </div>
                  <button onClick={() => setPartyId(undefined)} className="h-10 px-3 text-base font-semibold text-indigo-700">{t('change')}</button>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-amber-50 border-2 border-amber-200 space-y-2">
                  <p className="text-sm text-amber-900">{t('new_party_found')}</p>
                  <p className="text-base font-bold text-slate-900">{scan.sellerName ?? '—'}</p>
                  {newGstin && <p className="text-sm font-mono text-slate-700">{newGstin}</p>}
                  <button onClick={() => setAddParty(true)} className="w-full h-12 rounded-xl bg-amber-600 text-white text-base font-bold flex items-center justify-center gap-2">
                    <UserPlus className="w-5 h-5" /> {t('add_this_party')}
                  </button>
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100">
                <div className="p-3 flex justify-between text-base"><span>{t('bill_no')}</span><span className="font-bold">{scan.invoiceNo ?? '—'}</span></div>
                <div className="p-3 flex justify-between text-base"><span>{t('date')}</span><span className="font-bold">{scan.date ?? '—'}</span></div>
                <div className="p-3 text-base">
                  <p className="mb-1">{scan.items.length ? t('found_items', { n: scan.items.length }) : t('no_items')}</p>
                  {items.map((i, k) => (
                    <p key={k} className="text-sm text-slate-600">{i.name} · {i.qty} × {rs(i.rate)}</p>
                  ))}
                </div>
                <div className="p-3 flex justify-between text-base"><span>{t('gst_rate')}</span><span className="font-bold">{gstPct}%</span></div>
                <div className="p-3 flex justify-between text-lg"><span>{t('bill_total')}</span><span className="font-bold">{scan.total ? rs(scan.total) : rs(check)}</span></div>
              </div>

              {mismatch && (
                <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-base text-amber-900">{t('total_mismatch', mismatch)}</p>
              )}
              <p className="text-base text-slate-600">{t('check_before_save')}</p>

              <button onClick={proceed} className="w-full h-14 rounded-2xl bg-indigo-700 text-white text-lg font-bold">{t('continue_bill')}</button>
              <button onClick={() => camRef.current?.click()} className="w-full h-12 rounded-xl border-2 border-slate-200 text-base font-semibold">{t('take_photo')}</button>

              <button onClick={() => setShowText(!showText)} className="w-full h-10 text-base text-slate-600 flex items-center justify-center gap-2">
                {showText ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />} {t('text_read')}
              </button>
              {showText && <pre className="p-3 rounded-xl bg-slate-100 text-sm whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{rawText}</pre>}
            </div>
          )}
        </div>
      </Sheet>

      <PartyFormModal
        isOpen={addParty}
        onClose={() => setAddParty(false)}
        onSuccess={p => setPartyId(p.id)}
        prefill={scan ? {
          type: kind === 'SALE' ? 'CUSTOMER' : kind === 'JOB_WORK' ? 'ARTISAN' : 'SUPPLIER',
          name: scan.sellerName ?? '',
          gstin: newGstin ?? null,
          state_code: newGstin ? validateGSTIN(newGstin).stateCode : undefined,
          phone: scan.phones[0] ?? ''
        } : null}
      />
    </>
  );
};
