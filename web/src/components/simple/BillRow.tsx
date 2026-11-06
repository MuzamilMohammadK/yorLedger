import React from 'react';
import { ShoppingBag, Truck, Scissors, IndianRupee, Undo2 } from 'lucide-react';
import { formatPaiseToINR } from '@yorbalance/shared';
import { useI18n } from '../../i18n';
import { todayIST } from '../../lib/data/util';

export interface BillRowData {
  id: string;
  type: string; // SALE | PURCHASE | JOB_WORK | PAYMENT | RETURN
  party_name: string;
  invoice_number: string;
  invoice_date: string;
  due_date?: string | null;
  grand_total_paise: number;
  pending_paise: number;
  status: string;
}

const ICON: Record<string, typeof ShoppingBag> = {
  SALE: ShoppingBag, PURCHASE: Truck, JOB_WORK: Scissors, PAYMENT: IndianRupee, RETURN: Undo2
};
const TINT: Record<string, string> = {
  SALE: 'bg-emerald-100 text-emerald-800', PURCHASE: 'bg-sky-100 text-sky-800', JOB_WORK: 'bg-amber-100 text-amber-800',
  PAYMENT: 'bg-indigo-100 text-indigo-800', RETURN: 'bg-slate-200 text-slate-700'
};

export function statusOf(b: BillRowData): 'SETTLED' | 'PENDING' | 'PARTIAL' | 'OVERDUE' {
  if (b.pending_paise <= 0) return 'SETTLED';
  if (b.due_date && b.due_date < todayIST()) return 'OVERDUE';
  return b.pending_paise < b.grand_total_paise ? 'PARTIAL' : 'PENDING';
}

const BADGE: Record<string, string> = {
  SETTLED: 'bg-emerald-100 text-emerald-800', PENDING: 'bg-amber-100 text-amber-900',
  PARTIAL: 'bg-sky-100 text-sky-900', OVERDUE: 'bg-rose-100 text-rose-800'
};

/** One bill / payment / return line, large and tappable. */
export const BillRow: React.FC<{ bill: BillRowData; onClick?: () => void; right?: React.ReactNode }> = ({ bill, onClick, right }) => {
  const { t } = useI18n();
  const Icon = ICON[bill.type] ?? ShoppingBag;
  const isBill = ['SALE', 'PURCHASE', 'JOB_WORK'].includes(bill.type);
  const st = statusOf(bill);
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl bg-white border border-slate-200">
      <button type="button" onClick={onClick} className="flex-1 min-w-0 flex items-center gap-3 text-left">
        <span className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center ${TINT[bill.type] ?? TINT.SALE}`}>
          <Icon className="w-6 h-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-slate-900 truncate">{bill.party_name}</span>
          <span className="block text-sm text-slate-500 truncate">
            {t(`kind_${bill.type}` as any)} · #{bill.invoice_number} · {bill.invoice_date}
          </span>
        </span>
        <span className="text-right shrink-0">
          <span className="block text-base font-bold text-slate-900">{formatPaiseToINR(isBill && st !== 'SETTLED' ? bill.pending_paise : bill.grand_total_paise, true)}</span>
          {isBill && <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-bold ${BADGE[st]}`}>{t(`status_${st}` as any)}</span>}
        </span>
      </button>
      {right}
    </div>
  );
};
