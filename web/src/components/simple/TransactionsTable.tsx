import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Receipt, Undo2 } from 'lucide-react';
import { formatPaiseToINR, PaymentRecord, ReturnRecord } from '@yorbalance/shared';
import { useI18n } from '../../i18n';
import { BillRowData, statusOf } from './BillRow';
import { StatusBadge } from '../ui/StatusBadge';

export interface TxRow extends BillRowData {
  item_kind?: 'TRANSACTION' | 'PAYMENT' | 'RETURN';
  return_paise?: number;
  paid_paise?: number;
  transaction_id?: string | null;
  payments?: PaymentRecord[];
  returns?: ReturnRecord[];
  items?: any[];
}

const BADGE: Record<string, string> = {
  SETTLED: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  PARTIAL: 'bg-amber-100 text-amber-900 border border-amber-200',
  PENDING: 'bg-slate-100 text-slate-700 border border-slate-200',
  OVERDUE: 'bg-rose-100 text-rose-800 border border-rose-200'
};

const TYPE_BADGE: Record<string, string> = {
  SALE: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
  PURCHASE: 'bg-sky-50 text-sky-800 border border-sky-200',
  JOB_WORK: 'bg-amber-50 text-amber-800 border border-amber-200',
  RETURN: 'bg-rose-50 text-rose-800 border border-rose-200',
  PAYMENT: 'bg-indigo-50 text-indigo-800 border border-indigo-200'
};

const isBill = (r: TxRow) => ['SALE', 'PURCHASE', 'JOB_WORK'].includes(r.type);

/**
 * Compact one-line-per-bill table (Date | Party | Bill no. | Type | Bill total | Returned | Paid | Remaining | Status | View).
 * Uses overflow-x-auto fallback with sticky header and sticky Party column.
 */
export const TransactionsTable: React.FC<{
  rows: TxRow[];
  onOpen: (r: TxRow) => void;
  detailed?: boolean;
  expandedId?: string | null;
  onToggleExpand?: (id: string) => void;
  isJobWork?: boolean;
  fillHeight?: boolean;
  scrollRef?: React.RefObject<HTMLDivElement>;
  footer?: React.ReactNode;
}> = ({ rows, onOpen, expandedId: controlledExpandedId, onToggleExpand, fillHeight, scrollRef, footer }) => {
  const { t, fmtDate } = useI18n();
  const [localExpandedId, setLocalExpandedId] = useState<string | null>(null);
  const activeExpandedId = controlledExpandedId !== undefined ? controlledExpandedId : localExpandedId;
  const toggle = (id: string) => {
    if (onToggleExpand) onToggleExpand(id);
    else setLocalExpandedId(prev => (prev === id ? null : id));
  };

  const rs = (p?: number) => (p === undefined ? '—' : formatPaiseToINR(p, true));
  const thCls = 'py-2 px-3 text-left text-[11px] uppercase font-bold tracking-wider text-slate-500 whitespace-nowrap bg-slate-50 sticky top-0 z-20 shadow-[0_1px_0_0_#e2e8f0]';
  const tdCls = 'py-2 px-3 text-[13px] text-slate-900 align-middle';

  return (
    <div
      ref={scrollRef}
      className={
        fillHeight
          ? 'flex-1 min-h-0 w-full overflow-auto pb-4 rounded-2xl border border-slate-200 bg-white'
          : 'w-full overflow-x-auto max-h-[75vh] overflow-y-auto pb-4 rounded-2xl border border-slate-200 bg-white'
      }
      data-no-swipe
    >
      <table className="w-full border-collapse" style={{ tableLayout: 'auto' }}>
        <thead>
          <tr className="border-b border-slate-200">
            <th className={thCls}>{t('col_date')}</th>
            <th className={`${thCls} sticky left-0 z-30 min-w-[140px] max-w-[200px] shadow-[2px_0_4px_-2px_rgba(15,23,42,0.08)]`}>
              {t('col_party')}
            </th>
            <th className={thCls}>{t('col_invoice')}</th>
            <th className={thCls}>{t('col_type')}</th>
            <th className={`${thCls} text-right`}>{t('bill_total')}</th>
            <th className={`${thCls} text-right`}>{t('returned')}</th>
            <th className={`${thCls} text-right`}>{t('paid')}</th>
            <th className={`${thCls} text-right`}>{t('remaining')}</th>
            <th className={thCls}>{t('col_status')}</th>
            <th className={`${thCls} text-right`}><span className="sr-only">{t('view')}</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(r => {
            const billRow = isBill(r);
            const payments = r.payments ?? [];
            const returns = r.returns ?? [];
            const sortedPayments = [...payments].sort((a, b) => (a.payment_date || '').localeCompare(b.payment_date || ''));
            const sortedReturns = [...returns].sort((a, b) => (a.return_date || '').localeCompare(b.return_date || ''));
            const hasDetails = billRow && (sortedPayments.length > 0 || sortedReturns.length > 0);
            const isExpanded = activeExpandedId === r.id;

            const paidPaise = sortedPayments.length > 0
              ? sortedPayments.reduce((sum, p) => sum + (p.amount_paise || 0), 0)
              : (r.paid_paise || 0);
            const retPaise = r.return_paise || 0;
            const retTaxPaise = sortedReturns.reduce(
              (s, ret) => s + (ret.tax_paise ?? ((ret.cgst_paise ?? 0) + (ret.sgst_paise ?? 0) + (ret.igst_paise ?? 0))),
              0
            );
            const remainingPaise = Math.max(0, r.grand_total_paise - retPaise - paidPaise);
            const st = billRow ? statusOf({ ...r, paid_paise: paidPaise, pending_paise: remainingPaise }) : null;
            const totalSarees = (r.items || []).reduce((sum: number, it: any) => sum + (it.quantity || 0), 0);
            const typeLabel = t(`kind_${r.type}` as any);

            return (
              <React.Fragment key={`${r.item_kind ?? 'B'}-${r.id}`}>
                <tr
                  onClick={() => onOpen(r)}
                  className="group hover:bg-slate-50 cursor-pointer h-[52px] max-h-[56px]"
                >
                  {/* 1. Date */}
                  <td className={`${tdCls} whitespace-nowrap font-variant-numeric tabular-nums text-slate-700`}>
                    {fmtDate(r.invoice_date)}
                  </td>

                  {/* 2. Party (sticky left, 140-200px, single-line ellipsis + tooltip) */}
                  <td
                    title={r.party_name}
                    className={`${tdCls} sticky left-0 z-10 bg-white group-hover:bg-slate-50 font-semibold text-slate-900 min-w-[140px] max-w-[200px] truncate shadow-[2px_0_4px_-2px_rgba(15,23,42,0.06)]`}
                  >
                    {r.party_name}
                  </td>

                  {/* 3. Bill no. (+ chevron beside bill no.) */}
                  <td className={`${tdCls} font-mono text-[12px] whitespace-nowrap text-slate-700`}>
                    <div className="flex items-center gap-1">
                      {hasDetails ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggle(r.id); }}
                          className="w-6 h-6 rounded hover:bg-slate-200 text-slate-500 flex items-center justify-center shrink-0"
                          title="Toggle payments & returns"
                          aria-label="Toggle payments & returns"
                        >
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-indigo-600" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      ) : (
                        <span className="w-6 shrink-0" />
                      )}
                      <span>{r.invoice_number}</span>
                    </div>
                  </td>

                  {/* 4. Type */}
                  <td className={`${tdCls} whitespace-nowrap`}>
                    <span className={`inline-block rounded-md text-[12px] font-semibold px-[10px] py-[4px] leading-none ${TYPE_BADGE[r.type] ?? 'bg-slate-100 text-slate-700'}`}>
                      {typeLabel}{r.type === 'JOB_WORK' ? ` · ${totalSarees}` : ''}
                    </span>
                  </td>

                  {/* 5. Bill total */}
                  <td className={`${tdCls} tx-num text-right font-semibold text-slate-900`}>
                    {rs(r.grand_total_paise)}
                  </td>

                  {/* 6. Returned (+ incl. GST line) */}
                  <td className={`${tdCls} tx-num text-right text-slate-700`}>
                    {billRow ? (
                      <div className="leading-tight">
                        <span>{rs(retPaise)}</span>
                        {retPaise > 0 && retTaxPaise > 0 && (
                          <span className="block text-[11px] text-slate-500 font-normal">incl. GST {rs(retTaxPaise)}</span>
                        )}
                      </div>
                    ) : '—'}
                  </td>

                  {/* 7. Paid */}
                  <td className={`${tdCls} tx-num text-right font-semibold text-emerald-700`}>
                    {billRow ? rs(paidPaise) : '—'}
                  </td>

                  {/* 8. Remaining */}
                  <td className={`${tdCls} tx-num text-right font-bold text-slate-900`}>
                    {billRow ? rs(remainingPaise) : '—'}
                  </td>

                  {/* 9. Status */}
                  <td className={`${tdCls} whitespace-nowrap`}>
                    {st ? <StatusBadge status={st} /> : '—'}
                  </td>

                  {/* 10. View */}
                  <td className={`${tdCls} text-right whitespace-nowrap`}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onOpen(r); }}
                      className="rounded-lg text-[12px] font-semibold text-indigo-700 hover:bg-indigo-50 px-[10px] py-[4px] leading-none"
                    >
                      {t('view')}
                    </button>
                  </td>
                </tr>

                {/* Expandable Dropdown: Payments (date-wise), then Returns (date-wise) */}
                {hasDetails && isExpanded && (
                  <tr className="bg-slate-50/80 border-b border-indigo-100">
                    <td colSpan={10} className="px-4 py-3">
                      <div className="space-y-2.5 max-w-4xl">
                        {sortedPayments.length > 0 && (
                          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                            <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                              <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                <Receipt className="w-3.5 h-3.5 text-indigo-600" />
                                Payments ({sortedPayments.length})
                              </p>
                              <span className="text-xs font-mono text-slate-500">Bill #{r.invoice_number}</span>
                            </div>
                            <div className="divide-y divide-slate-100 text-xs">
                              {sortedPayments.map((p, idx) => {
                                const receiptNo = p.reference_number || (p.cheque_number ? `CHQ-${p.cheque_number}` : (p.id ? `RCP-${p.id.slice(-6).toUpperCase()}` : '—'));
                                return (
                                  <div key={p.id || idx} className="py-1.5 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="tx-num font-medium text-slate-700">{fmtDate(p.payment_date)}</span>
                                      <span className="px-1.5 py-0.5 rounded bg-slate-100 font-semibold text-slate-700">{p.payment_mode || '—'}</span>
                                      <span className="font-mono text-slate-500">{receiptNo}</span>
                                    </div>
                                    <span className="tx-num font-bold text-emerald-700">{rs(p.amount_paise)}</span>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 text-xs font-semibold">
                              <span className="text-slate-700">Total paid: <b className="tx-num text-emerald-700">{rs(paidPaise)}</b></span>
                              <span className="text-slate-700">Remaining: <b className="tx-num text-slate-900">{rs(remainingPaise)}</b></span>
                            </div>
                          </div>
                        )}

                        {sortedReturns.length > 0 && (
                          <div className="rounded-xl border border-amber-200 bg-white p-3 space-y-2">
                            <div className="flex items-center justify-between pb-1.5 border-b border-amber-100">
                              <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                <Undo2 className="w-3.5 h-3.5 text-amber-600" />
                                Returns ({sortedReturns.length})
                              </p>
                              <span className="text-xs font-mono text-slate-500">Total − {rs(retPaise)}</span>
                            </div>
                            <div className="divide-y divide-slate-100 text-xs">
                              {sortedReturns.map((ret, idx) => {
                                const rTax = ret.tax_paise ?? ((ret.cgst_paise ?? 0) + (ret.sgst_paise ?? 0) + (ret.igst_paise ?? 0));
                                const rGoods = ret.taxable_paise ?? Math.max(0, ret.amount_paise - rTax);
                                const itemTxt = (ret.items ?? []).map(it => `${it.qty}× ${it.name}`).join(', ');
                                return (
                                  <div key={ret.id || idx} className="py-1.5 flex items-start justify-between gap-2">
                                    <div>
                                      <span className="tx-num font-medium text-slate-700">{fmtDate(ret.return_date)}</span>
                                      {ret.reason && <span className="text-slate-600"> · {ret.reason}</span>}
                                      {itemTxt && <span className="text-slate-600"> · {itemTxt}</span>}
                                      <span className="block text-[11px] text-slate-500">Goods {rs(rGoods)}{rTax > 0 ? ` + GST ${rs(rTax)}` : ''}</span>
                                    </div>
                                    <span className="tx-num font-bold text-rose-700 shrink-0">− {rs(ret.amount_paise)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      {footer}
    </div>
  );
};
