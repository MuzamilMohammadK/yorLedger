import React, { useEffect, useRef, useState } from 'react';
import { Banknote, Landmark, Receipt, Loader2, AlertTriangle, Camera } from 'lucide-react';
import { Party, PaymentPayload, Transaction, formatPaiseToINR, parsePaymentText, validatePayment } from '@yorbalance/shared';
import { readImage } from '../../lib/ocr';
import { api, ApiError } from '../../lib/api';
import { useI18n } from '../../i18n';
import { todayIST } from '../../lib/data/util';
import { Sheet } from '../ledger/NewTransactionModal';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialPartyId?: string;
  initialPartyName?: string;
  initialTransactionId?: string;
  initialInvoiceNumber?: string;
  initialRemainingRupees?: number;
  parties?: Party[];
  /** Values read from a scanned cheque / bank screenshot. */
  scanned?: { mode?: 'CHEQUE' | 'NEFT'; amount?: string; utr_no?: string; cheque_no?: string; date?: string } | null;
}

type Mode = 'CASH' | 'CHEQUE' | 'NEFT';
const MODES: { mode: Mode; icon: typeof Banknote }[] = [
  { mode: 'CASH', icon: Banknote },
  { mode: 'CHEQUE', icon: Receipt },
  { mode: 'NEFT', icon: Landmark }
];

function toPaise(v: string): number | null {
  const s = v.trim();
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [w, f = ''] = s.split('.');
  return parseInt(w, 10) * 100 + parseInt((f + '00').slice(0, 2), 10);
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen, onClose, onSuccess, initialTransactionId, scanned
}) => {
  const { t } = useI18n();
  const [bill, setBill] = useState<Transaction | null>(null);
  const [mode, setMode] = useState<Mode>('CASH');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIST());
  const [collectedBy, setCollectedBy] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [depositDate, setDepositDate] = useState('');
  const [clearingDate, setClearingDate] = useState('');
  const [utr, setUtr] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [scanning, setScanning] = useState<number | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !initialTransactionId) return;
    setBill(null);
    setErrors({});
    setFormError(null);
    setMode(scanned?.mode ?? 'CASH');
    setDate(scanned?.date ?? todayIST());
    setUtr(scanned?.utr_no ?? '');
    setChequeNo(scanned?.cheque_no ?? '');
    setCollectedBy('');
    setDepositDate('');
    setClearingDate('');
    setNotes('');
    api.getTransactionDetails(initialTransactionId)
      .then(({ transaction }) => {
        setBill(transaction);
        setAmount(scanned?.amount ?? (transaction.pending_paise / 100).toFixed(2).replace(/\.00$/, ''));
      })
      .catch(e => setFormError(e.message));
  }, [isOpen, initialTransactionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const incoming = bill?.type === 'SALE'; // SALE: we collect. PURCHASE / JOB_WORK: we pay.
  const rs = (p: number) => formatPaiseToINR(p, true);
  const field = 'w-full h-12 px-3 rounded-xl border-2 border-slate-200 bg-white text-base text-slate-900 focus:border-indigo-600 focus:outline-none';
  const err = (k: string) => errors[k] && <p className="mt-1 text-sm text-rose-600">{errors[k]}</p>;
  const paise = toPaise(amount);
  const tooMuch = bill && paise !== null && paise > bill.pending_paise;

  // Read a cheque photo or a bank / UPI screenshot and fill what we can.
  const onScanFile = async (f?: File) => {
    if (!f || !bill) return;
    setScanNote(null);
    setScanning(0);
    try {
      const { text } = await readImage(f, 'payment', setScanning);
      const r = parsePaymentText(text);
      if (!r.mode && !r.amount && !r.date) { setScanNote(t('nothing_found')); return; }
      if (r.mode) setMode(r.mode);
      if (r.amount && r.amount <= bill.pending_paise) setAmount((r.amount / 100).toFixed(2).replace(/\.00$/, ''));
      if (r.utr) setUtr(r.utr);
      if (r.chequeNo) setChequeNo(r.chequeNo);
      if (r.date) setDate(r.date);
      setScanNote(t('filled_from_scan'));
    } catch {
      setScanNote(t('read_fail'));
    } finally {
      setScanning(null);
    }
  };

  const save = async () => {
    if (!bill) return;
    if (!paise) { setErrors({ amount: t('required') }); return; }
    let payload: PaymentPayload;
    if (mode === 'CASH') payload = { mode, bill_id: bill.id, amount: paise, paid_on: date, collected_by: collectedBy, notes };
    else if (mode === 'CHEQUE') payload = { mode, bill_id: bill.id, amount: paise, cheque_no: chequeNo, cheque_date: date,
                                            deposit_date: depositDate || null, clearing_date: clearingDate || null, notes };
    else payload = { mode, bill_id: bill.id, amount: paise, utr_no: utr, txn_date: date, notes };
    // Same validation as the save (shared/payment.ts).
    const errs = validatePayment(payload, bill.pending_paise);
    if (errs.amount && paise > bill.pending_paise) errs.amount = t('more_than_due');
    if (errs.collected_by) errs.collected_by = t('required');
    if (errs.utr_no) errs.utr_no = t('required');
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    setFormError(null);
    try {
      await api.recordPayment(payload);
      onSuccess();
      onClose();
    } catch (e) {
      if (e instanceof ApiError) { setFormError(e.message); if (e.fields) setErrors(e.fields); }
      else setFormError(navigator.onLine ? t('error_generic') : t('error_offline'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose} title={incoming ? t('got_money') : t('gave_money')}>
      <div className="p-4 sm:p-6 space-y-5">
        {formError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-base flex gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /> {formError}
          </div>
        )}
        {!bill ? (
          !formError && <div className="py-10 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
        ) : (
          <>
            <div className={`rounded-2xl p-4 ${incoming ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'}`}>
              <p className="text-base font-semibold">{bill.party_name} · #{bill.invoice_number}</p>
              <p className="text-sm opacity-80">{incoming ? t('balance_due') : t('balance_to_pay')}</p>
              <p className="text-3xl font-bold">{rs(bill.pending_paise)}</p>
            </div>

            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { onScanFile(e.target.files?.[0]); e.target.value = ''; }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={scanning !== null}
              className="w-full h-12 rounded-xl border-2 border-indigo-300 bg-indigo-50 text-indigo-800 text-base font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {scanning !== null
                ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('reading')} {Math.round(scanning * 100)}%</>
                : <><Camera className="w-5 h-5" /> {t('scan_proof')}</>}
            </button>
            {scanNote && <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-base text-amber-900">{scanNote}</p>}

            <div>
              <p className="text-base font-semibold text-slate-800 mb-2">{t('how_paid')}</p>
              <div className="grid grid-cols-3 gap-2">
                {MODES.map(({ mode: m, icon: Icon }) => (
                  <button key={m} type="button" onClick={() => setMode(m)}
                    className={`min-h-[72px] rounded-2xl border-2 flex flex-col items-center justify-center gap-1 ${mode === m ? 'border-indigo-600 bg-indigo-50 text-indigo-900' : 'border-slate-200 text-slate-600'}`}>
                    <Icon className="w-7 h-7" />
                    <span className="text-base font-bold">{t(`mode_${m}`)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="pay-amount" className="block text-base font-semibold text-slate-800 mb-1">{t('amount')} ₹</label>
              <input id="pay-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                className={`${field} text-2xl font-bold h-14 ${tooMuch ? 'border-rose-500' : ''}`} />
              {tooMuch && <p className="mt-1 text-sm text-rose-600">{t('more_than_due')}</p>}
              {err('amount')}
              <button type="button" onClick={() => setAmount((bill.pending_paise / 100).toFixed(2).replace(/\.00$/, ''))}
                className="mt-2 text-base font-semibold text-indigo-700 underline">{t('full_amount')}</button>
            </div>

            {mode === 'CASH' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="text-base font-semibold text-slate-800">{t('date')}
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className={field} />
                </label>
                <label className="text-base font-semibold text-slate-800">{incoming ? t('collected_by') : t('paid_by')}
                  <input value={collectedBy} onChange={e => setCollectedBy(e.target.value)} className={field} />
                  {err('collected_by')}
                </label>
              </div>
            )}

            {mode === 'CHEQUE' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-base font-semibold text-slate-800">{t('cheque_no')}
                    <input inputMode="numeric" value={chequeNo} onChange={e => setChequeNo(e.target.value.replace(/\D/g, ''))} className={field} />
                  </label>
                  <label className="text-base font-semibold text-slate-800">{t('cheque_date')}
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} className={field} />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-base font-semibold text-slate-800">{t('deposit_date')} <span className="font-normal text-slate-500">({t('later_ok')})</span>
                    <input type="date" value={depositDate} onChange={e => setDepositDate(e.target.value)} className={field} />
                  </label>
                  <label className="text-base font-semibold text-slate-800">{t('clearing_date')} <span className="font-normal text-slate-500">({t('later_ok')})</span>
                    <input type="date" value={clearingDate} onChange={e => setClearingDate(e.target.value)} className={field} />
                  </label>
                </div>
              </div>
            )}

            {mode === 'NEFT' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="text-base font-semibold text-slate-800">{t('utr_no')}
                  <input value={utr} onChange={e => setUtr(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())} className={`${field} font-mono`} />
                  {err('utr_no')}
                </label>
                <label className="text-base font-semibold text-slate-800">{t('txn_date')}
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className={field} />
                </label>
              </div>
            )}

            <label className="block text-base font-semibold text-slate-800">{t('notes')}
              <input value={notes} onChange={e => setNotes(e.target.value)} className={field} />
            </label>

            <button type="button" onClick={save} disabled={busy || !!tooMuch}
              className={`w-full h-14 rounded-2xl text-white text-lg font-bold flex items-center justify-center gap-2 disabled:opacity-60 ${incoming ? 'bg-emerald-700' : 'bg-rose-700'}`}>
              {busy ? <><Loader2 className="w-6 h-6 animate-spin" /> {t('saving')}</> : t('save_payment')}
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
};
