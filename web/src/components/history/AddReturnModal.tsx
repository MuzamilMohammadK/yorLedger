import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertTriangle, Minus, Plus } from 'lucide-react';
import { Transaction, computeReturn, formatPaiseToINR } from '@yorbalance/shared';
import { api, ApiError } from '../../lib/api';
import { useI18n } from '../../i18n';
import { todayIST } from '../../lib/data/util';
import { cache } from '../../lib/data/cache';
import { Sheet } from '../ledger/NewTransactionModal';

interface AddReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  transaction: Transaction | null;
}

/** Return goods against one bill, item by item (spec §9.5). */
export const AddReturnModal: React.FC<AddReturnModalProps> = ({ isOpen, onClose, onSuccess, transaction }) => {
  const { t } = useI18n();
  const [qty, setQty] = useState<Record<number, number>>({});
  const [date, setDate] = useState(todayIST());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQty({});
    setDate(todayIST());
    setReason('');
    setFormError(null);
  }, [isOpen, transaction?.id]);

  // Use the bill's own stored snapshot so the preview matches what is saved.
  const raw = transaction ? cache.rawBill(transaction.id) : undefined;
  const returnedQty: Record<string, number> = raw?.returned_qty ?? {};

  const preview = useMemo(() => {
    if (!raw) return null;
    const lines = Object.entries(qty).map(([i, q]) => ({ index: Number(i), qty: q })).filter(l => l.qty > 0);
    if (!lines.length) return null;
    try {
      return computeReturn({ items: raw.items, gstBp: raw.gst_bp, taxMode: raw.tax_mode, grandTotal: raw.grand_total,
                             returnedTotal: raw.returned_total, returnedQty }, lines);
    } catch {
      return null;
    }
  }, [qty, raw]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen || !transaction) return null;
  const rs = (p: number) => formatPaiseToINR(p, true);
  const field = 'w-full h-12 px-3 rounded-xl border-2 border-slate-200 bg-white text-base text-slate-900 focus:border-indigo-600 focus:outline-none';

  const save = async () => {
    const lines = Object.entries(qty).map(([i, q]) => ({ index: Number(i), qty: q })).filter(l => l.qty > 0);
    if (!lines.length) { setFormError(t('nothing_selected')); return; }
    setBusy(true);
    setFormError(null);
    try {
      await api.recordReturn({ bill_id: transaction.id, returned_on: date, lines, reason: reason || null });
      onSuccess();
      onClose();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : navigator.onLine ? t('error_generic') : t('error_offline'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose} title={t('return_title')}>
      <div className="p-4 sm:p-6 space-y-5">
        <p className="text-base text-slate-700">{transaction.party_name} · #{transaction.invoice_number} · {rs(transaction.grand_total_paise)}</p>
        {formError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-base flex gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /> {formError}
          </div>
        )}

        <div className="space-y-3">
          {(transaction.items ?? []).map((it, i) => {
            const done = returnedQty[String(i)] ?? 0;
            const left = it.quantity - done;
            const cur = qty[i] ?? 0;
            const set = (n: number) => setQty({ ...qty, [i]: Math.max(0, Math.min(left, n)) });
            return (
              <div key={it.id} className="rounded-2xl border-2 border-slate-200 p-3">
                <p className="text-base font-bold text-slate-900">{it.item_name}</p>
                <p className="text-sm text-slate-600">
                  {t('bought_qty')}: {it.quantity} · {t('already_returned')}: {done} · {rs(it.rate_paise)}
                </p>
                {left > 0 ? (
                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-base text-slate-700 flex-1">{t('return_now')}</span>
                    <button type="button" aria-label="−" onClick={() => set(cur - 1)} className="w-12 h-12 rounded-xl border-2 border-slate-300 flex items-center justify-center"><Minus className="w-5 h-5" /></button>
                    <input inputMode="numeric" value={cur || ''} placeholder="0" aria-label={t('return_now')}
                      onChange={e => set(parseInt(e.target.value.replace(/\D/g, '') || '0', 10))}
                      className="w-16 h-12 text-center rounded-xl border-2 border-slate-300 text-xl font-bold" />
                    <button type="button" aria-label="+" onClick={() => set(cur + 1)} className="w-12 h-12 rounded-xl border-2 border-slate-300 flex items-center justify-center"><Plus className="w-5 h-5" /></button>
                  </div>
                ) : null}
                {left > 0 && <p className="mt-1 text-sm text-slate-500">{t('can_return', { n: left })}</p>}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-base font-semibold text-slate-800">{t('date')}
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={field} />
          </label>
          <label className="text-base font-semibold text-slate-800">{t('reason')}
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder={t('reason_ph')} className={field} />
          </label>
        </div>

        <div className="rounded-2xl bg-slate-900 text-white p-4 flex justify-between items-baseline">
          <span className="text-lg">{t('return_value')}</span>
          <span className="text-3xl font-bold">{rs(preview?.totalReduction ?? 0)}</span>
        </div>

        <button type="button" onClick={save} disabled={busy || !preview}
          className="w-full h-14 rounded-2xl bg-indigo-700 text-white text-lg font-bold flex items-center justify-center gap-2 disabled:opacity-60">
          {busy ? <><Loader2 className="w-6 h-6 animate-spin" /> {t('saving')}</> : t('save_return')}
        </button>
      </div>
    </Sheet>
  );
};
