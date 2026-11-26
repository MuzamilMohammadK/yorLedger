import React from 'react';
import { useI18n } from '../../i18n';

export type BillStatus = 'SETTLED' | 'PARTIAL' | 'PENDING' | 'OVERDUE';

const STYLES: Record<BillStatus, string> = {
  SETTLED: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  PARTIAL: 'bg-amber-100 text-amber-900 border border-amber-200',
  PENDING: 'bg-slate-100 text-slate-700 border border-slate-200',
  OVERDUE: 'bg-rose-100 text-rose-800 border border-rose-200',
};

/** Shared status badge: one colour + text label per status across every page. */
export const StatusBadge: React.FC<{ status: BillStatus | string; className?: string }> = ({ status, className = '' }) => {
  const { t } = useI18n();
  const key = (status in STYLES ? status : 'PENDING') as BillStatus;
  return (
    <span className={`inline-block rounded-full text-xs font-bold px-2.5 py-1 leading-none whitespace-nowrap ${STYLES[key]} ${className}`}>
      {t(`status_${key}` as any)}
    </span>
  );
};
