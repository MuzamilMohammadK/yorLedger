import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Receipt } from 'lucide-react';
import { formatPaiseToINR, PaymentRecord, ReturnRecord } from '@yorbalance/shared';
import { useI18n } from '../../i18n';
import { BillRow, BillRowData, statusOf } from './BillRow';

export interface TxRow extends BillRowData {
  item_kind?: 'TRANSACTION' | 'PAYMENT' | 'RETURN';
  return_paise?: number;
  paid_paise?: number;
  transaction_id?: string | null;
  payments?: PaymentRecord[];
  returns?: ReturnRecord[];
}

const BADGE: Record<string, string> = {
  SETTLED: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  PARTIAL: 'bg-amber-100 text-amber-900 border border-amber-200',
  PENDING: 'bg-slate-100 text-slate-700 border border-slate-200',
  OVERDUE: 'bg-rose-100 text-rose-800 border border-rose-200'
};
const isBill = (r: TxRow) => ['SALE', 'PURCHASE', 'JOB_WORK'].includes(r.type);

/**
 * Transactions as a table on desktop and cards on phones (§6.5, §9.3).
 * `detailed` adds the History columns: original amount, returns, paid, remaining.
 */
export const TransactionsTable: React.FC<{
  rows: TxRow[];
  onOpen: (r: TxRow) => void;
  detailed?: boolean;
  expandedId?: string | null;
  onToggleExpand?: (id: string) => void;
}> = ({ rows, onOpen, detailed, expandedId: controlledExpandedId, onToggleExpand }) => {
  const { t, fmtDate } = useI18n();
  const [localExpandedId, setLocalExpandedId] = useState<string | null>(null);
  const activeExpandedId = controlledExpandedId !== undefined ? controlledExpandedId : localExpandedId;
  const toggle = (id: string) => {
    if (onToggleExpand) {
      onToggleExpand(id);
    } else {
      setLocalExpandedId(prev => (prev === id ? null : id));
    }
  };

  const rs = (p?: number) => (p === undefined ? '—' : formatPaiseToINR(p, true));
  const th = 'px-3 py-3 text-left text-sm font-semibold text-slate-600 whitespace-nowrap';
  const td = 'px-3 py-3 text-base text-slate-900 whitespace-nowrap';

  return (
    <>
      {/* Phones: cards */}
      <div className="md:hidden space-y-2">
        {rows.map(r => (
          <BillRow
            key={`${r.item_kind ?? 'B'}-${r.id}`}
            bill={r}
            onClick={() => onOpen(r)}
            isExpanded={activeExpandedId === r.id}
            onToggleExpand={() => toggle(r.id)}
          />
        ))}
      </div>
      {/* Desktop: table (scrolls sideways inside its own box, never the page) */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200 bg-white" data-no-swipe>
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>{t('col_date')}</th>
              <th className={th}>{t('col_party')}</th>
              <th className={th}>{t('col_invoice')}</th>
              <th className={th}>{t('col_type')}</th>
              <th className={`${th} text-right`}>{detailed ? t('bill_total') : t('col_amount')}</th>
              {detailed && <th className={`${th} text-right`}>{t('returned')}</th>}
              {detailed && <th className={`${th} text-right`}>{t('paid')}</th>}
              {detailed && <th className={`${th} text-right`}>{t('remaining')}</th>}
              <th className={th}>{t('col_status')}</th>
              <th className={th}><span className="sr-only">{t('view')}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(r => {
              const billRow = isBill(r);
              const payments = r.payments ?? [];
              const hasPayments = billRow && payments.length > 0;
              const isExpanded = activeExpandedId === r.id;
              const paidPaise = hasPayments
                ? payments.reduce((sum, p) => sum + (p.amount_paise || 0), 0)
                : (r.paid_paise || 0);
              const retPaise = r.return_paise || 0;
              const remainingPaise = Math.max(0, r.grand_total_paise - retPaise - paidPaise);
              const st = billRow ? statusOf({ ...r, paid_paise: paidPaise, pending_paise: remainingPaise }) : null;
              const sortedPayments = [...payments].sort((a, b) => (a.payment_date || '').localeCompare(b.payment_date || ''));

              return (
                <React.Fragment key={`${r.item_kind ?? 'B'}-${r.id}`}>
                  <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => onOpen(r)}>
                    <td className={td}>{fmtDate(r.invoice_date)}</td>
                    <td className={`${td} font-semibold max-w-[14rem] truncate`}>{r.party_name}</td>
                    <td className={`${td} font-mono`}>
                      <div className="flex items-center gap-1.5">
                        {hasPayments ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggle(r.id);
                            }}
                            className="p-1 rounded-md hover:bg-slate-200 text-slate-500 transition-colors"
                            title="Toggle payment history"
                            aria-label="Toggle payment history"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-indigo-600" /> : <ChevronDown className="w-4 h-4 text-slate-600" />}
                          </button>
                        ) : (
                          <span className="w-6 shrink-0" />
                        )}
                        <span>{r.invoice_number}</span>
                      </div>
                    </td>
                    <td className={td}>{t(`kind_${r.type}` as any)}</td>
                    <td className={`${td} text-right font-semibold`}>{rs(r.grand_total_paise)}</td>
                    {detailed && <td className={`${td} text-right`}>{billRow ? rs(retPaise) : '—'}</td>}
                    {detailed && <td className={`${td} text-right text-emerald-700 font-semibold`}>{billRow ? rs(paidPaise) : '—'}</td>}
                    {detailed && <td className={`${td} text-right font-semibold`}>{billRow ? rs(remainingPaise) : '—'}</td>}
                    <td className={td}>
                      {st ? <span className={`px-2 py-1 rounded-full text-sm font-bold ${BADGE[st]}`}>{t(`status_${st}` as any)}</span> : '—'}
                    </td>
                    <td className={td}><button type="button" className="h-10 px-3 rounded-lg text-base font-semibold text-indigo-700 hover:bg-indigo-50">{t('view')}</button></td>
                  </tr>

                  {/* Dropdown accordion for payments on desktop */}
                  {hasPayments && isExpanded && (
                    <tr className="bg-slate-50/80 border-b border-indigo-100">
                      <td colSpan={detailed ? 10 : 6} className="px-6 py-3">
                        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                              <Receipt className="w-4 h-4 text-indigo-600" />
                              Payment History ({sortedPayments.length} {sortedPayments.length === 1 ? 'payment' : 'payments'})
                            </p>
                            <span className="text-xs font-mono text-slate-500">Bill #{r.invoice_number}</span>
                          </div>

                          <div className="max-h-56 overflow-y-auto overflow-x-auto divide-y divide-slate-100 rounded-lg border border-slate-100">
                            <table className="min-w-full text-left text-sm">
                              <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0">
                                <tr>
                                  <th className="px-3 py-2">Date</th>
                                  <th className="px-3 py-2 text-right">Amount paid</th>
                                  <th className="px-3 py-2">Payment mode</th>
                                  <th className="px-3 py-2">Receipt no.</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-slate-800">
                                {sortedPayments.map((p, idx) => {
                                  const receiptNo = p.reference_number || (p.cheque_number ? `CHQ-${p.cheque_number}` : (p.id ? `RCP-${p.id.slice(-6).toUpperCase()}` : '—'));
                                  return (
                                    <tr key={p.id || idx} className="hover:bg-slate-50/60">
                                      <td className="px-3 py-2 font-medium">{fmtDate(p.payment_date)}</td>
                                      <td className="px-3 py-2 text-right font-bold text-emerald-700">{rs(p.amount_paise)}</td>
                                      <td className="px-3 py-2">
                                        <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-xs font-semibold text-slate-700">
                                          {p.payment_mode || '—'}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 font-mono text-xs text-slate-600">{receiptNo}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-sm font-semibold">
                            <div className="text-slate-700">
                              Total paid: <span className="text-emerald-700 font-bold ml-1">{rs(paidPaise)}</span>
                            </div>
                            <div className="text-slate-700">
                              Remaining: <span className="text-slate-900 font-extrabold ml-1">{rs(remainingPaise)}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};
