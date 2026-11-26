import React from 'react';
import { ShoppingBag, Truck, Scissors, IndianRupee, Undo2, ChevronDown, ChevronUp } from 'lucide-react';
import { formatPaiseToINR, PaymentRecord } from '@yorbalance/shared';
import { useI18n } from '../../i18n';
import { todayIST } from '../../lib/data/util';
import { StatusBadge } from '../ui/StatusBadge';

export interface BillRowData {
  id: string;
  type: string; // SALE | PURCHASE | JOB_WORK | PAYMENT | RETURN
  party_name: string;
  invoice_number: string;
  invoice_date: string;
  due_date?: string | null;
  grand_total_paise: number;
  paid_paise?: number;
  return_paise?: number;
  pending_paise: number;
  status: string;
  payments?: PaymentRecord[];
}

const ICON: Record<string, typeof ShoppingBag> = {
  SALE: ShoppingBag, PURCHASE: Truck, JOB_WORK: Scissors, PAYMENT: IndianRupee, RETURN: Undo2
};
const TINT: Record<string, string> = {
  SALE: 'bg-emerald-100 text-emerald-800', PURCHASE: 'bg-sky-100 text-sky-800', JOB_WORK: 'bg-amber-100 text-amber-800',
  PAYMENT: 'bg-indigo-100 text-indigo-800', RETURN: 'bg-slate-200 text-slate-700'
};

export function statusOf(b: BillRowData): 'SETTLED' | 'PENDING' | 'PARTIAL' | 'OVERDUE' {
  const paid = b.payments?.length
    ? b.payments.reduce((sum, p) => sum + (p.amount_paise || 0), 0)
    : (b.paid_paise || 0);
  const ret = b.return_paise || 0;
  const pending = Math.max(0, b.grand_total_paise - ret - paid);

  if (pending <= 0) return 'SETTLED';
  if (paid > 0 || ret > 0) return 'PARTIAL';
  if (b.due_date && b.due_date < todayIST()) return 'OVERDUE';
  return 'PENDING';
}

const BADGE: Record<string, string> = {
  SETTLED: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  PARTIAL: 'bg-amber-100 text-amber-900 border border-amber-200',
  PENDING: 'bg-slate-100 text-slate-700 border border-slate-200',
  OVERDUE: 'bg-rose-100 text-rose-800 border border-rose-200'
};

/** One bill / payment / return line, large and tappable with accordion for payments. */
export const BillRow: React.FC<{
  bill: BillRowData;
  onClick?: () => void;
  right?: React.ReactNode;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}> = ({ bill, onClick, right, isExpanded, onToggleExpand }) => {
  const { t, fmtDate } = useI18n();
  const Icon = ICON[bill.type] ?? ShoppingBag;
  const isBill = ['SALE', 'PURCHASE', 'JOB_WORK'].includes(bill.type);
  const st = statusOf(bill);
  const payments = bill.payments ?? [];
  const hasPayments = isBill && payments.length > 0;
  const paidPaise = payments.length
    ? payments.reduce((sum, p) => sum + (p.amount_paise || 0), 0)
    : (bill.paid_paise || 0);
  const retPaise = bill.return_paise || 0;
  const remainingPaise = Math.max(0, bill.grand_total_paise - retPaise - paidPaise);
  const rs = (p: number) => formatPaiseToINR(p, true);

  const sortedPayments = [...payments].sort((a, b) => (a.payment_date || '').localeCompare(b.payment_date || ''));

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onClick} className="flex-1 min-w-0 flex items-center gap-3 text-left">
          <span className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center ${TINT[bill.type] ?? TINT.SALE}`}>
            <Icon className="w-6 h-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold text-slate-900 truncate">{bill.party_name}</span>
            <span className="block text-sm text-slate-500 truncate">
              {t(`kind_${bill.type}` as any)} · #{bill.invoice_number} · {fmtDate(bill.invoice_date)}
              {bill.type === 'JOB_WORK' && ` · ${((bill as any).items || []).reduce((sum: number, it: any) => sum + (it.quantity || 0), 0)} sarees`}
            </span>
          </span>
          <span className="text-right shrink-0">
            <span className="block text-base font-bold text-slate-900">
              {rs(isBill && st !== 'SETTLED' ? remainingPaise : bill.grand_total_paise)}
            </span>
            {isBill && <StatusBadge status={st} className="mt-0.5" />}
          </span>
        </button>

        {hasPayments && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand?.();
            }}
            className="w-10 h-10 shrink-0 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Toggle payment details"
            title="Toggle payment details"
          >
            {isExpanded ? <ChevronUp className="w-5 h-5 text-indigo-600" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        )}

        {right}
      </div>

      {/* Accordion dropdown for mobile */}
      {hasPayments && isExpanded && (
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold px-1">
            <span>PAID DETAILS ({sortedPayments.length})</span>
            <span>#{bill.invoice_number}</span>
          </div>

          <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50">
            {sortedPayments.map((p, idx) => {
              const receiptNo = p.reference_number || (p.cheque_number ? `CHQ-${p.cheque_number}` : (p.id ? `RCP-${p.id.slice(-6).toUpperCase()}` : '—'));
              return (
                <div key={p.id || idx} className="p-2.5 flex items-center justify-between gap-2 text-sm bg-white">
                  <div>
                    <div className="font-semibold text-slate-800">{fmtDate(p.payment_date)}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                        {p.payment_mode || '—'}
                      </span>
                      <span className="font-mono">{receiptNo}</span>
                    </div>
                  </div>
                  <div className="text-right font-bold text-emerald-700">
                    {rs(p.amount_paise)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between px-2 pt-1 text-sm font-semibold text-slate-700">
            <span>Total paid: <b className="text-emerald-700 ml-1">{rs(paidPaise)}</b></span>
            <span>Remaining: <b className="text-slate-900 font-bold ml-1">{rs(remainingPaise)}</b></span>
          </div>
        </div>
      )}
    </div>
  );
};
