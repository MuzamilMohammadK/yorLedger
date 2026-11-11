import React from 'react';
import { formatPaiseToINR } from '@yorbalance/shared';
import { useI18n } from '../../i18n';
import { BillRow, BillRowData, statusOf } from './BillRow';

export interface TxRow extends BillRowData {
  item_kind?: 'TRANSACTION' | 'PAYMENT' | 'RETURN';
  return_paise?: number;
  paid_paise?: number;
  transaction_id?: string | null;
}

const BADGE: Record<string, string> = {
  SETTLED: 'bg-emerald-100 text-emerald-800', PENDING: 'bg-amber-100 text-amber-900',
  PARTIAL: 'bg-sky-100 text-sky-900', OVERDUE: 'bg-rose-100 text-rose-800'
};
const isBill = (r: TxRow) => ['SALE', 'PURCHASE', 'JOB_WORK'].includes(r.type);

/**
 * Transactions as a table on desktop and cards on phones (§6.5, §9.3).
 * `detailed` adds the History columns: original amount, returns, paid, remaining.
 */
export const TransactionsTable: React.FC<{ rows: TxRow[]; onOpen: (r: TxRow) => void; detailed?: boolean }> = ({ rows, onOpen, detailed }) => {
  const { t, fmtDate } = useI18n();
  const rs = (p?: number) => (p === undefined ? '—' : formatPaiseToINR(p, true));
  const th = 'px-3 py-3 text-left text-sm font-semibold text-slate-600 whitespace-nowrap';
  const td = 'px-3 py-3 text-base text-slate-900 whitespace-nowrap';
  return (
    <>
      {/* Phones: cards */}
      <div className="md:hidden space-y-2">
        {rows.map(r => <BillRow key={`${r.item_kind ?? 'B'}-${r.id}`} bill={r} onClick={() => onOpen(r)} />)}
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
              const st = isBill(r) ? statusOf(r) : null;
              return (
                <tr key={`${r.item_kind ?? 'B'}-${r.id}`} className="hover:bg-slate-50 cursor-pointer" onClick={() => onOpen(r)}>
                  <td className={td}>{fmtDate(r.invoice_date)}</td>
                  <td className={`${td} font-semibold max-w-[14rem] truncate`}>{r.party_name}</td>
                  <td className={`${td} font-mono`}>{r.invoice_number}</td>
                  <td className={td}>{t(`kind_${r.type}` as any)}</td>
                  <td className={`${td} text-right font-semibold`}>{rs(r.grand_total_paise)}</td>
                  {detailed && <td className={`${td} text-right`}>{isBill(r) ? rs(r.return_paise ?? 0) : '—'}</td>}
                  {detailed && <td className={`${td} text-right`}>{isBill(r) ? rs(r.paid_paise ?? 0) : '—'}</td>}
                  {detailed && <td className={`${td} text-right font-semibold`}>{isBill(r) ? rs(r.pending_paise) : '—'}</td>}
                  <td className={td}>
                    {st ? <span className={`px-2 py-1 rounded-full text-sm font-bold ${BADGE[st]}`}>{t(`status_${st}` as any)}</span> : '—'}
                  </td>
                  <td className={td}><button type="button" className="h-10 px-3 rounded-lg text-base font-semibold text-indigo-700 hover:bg-indigo-50">{t('view')}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};
