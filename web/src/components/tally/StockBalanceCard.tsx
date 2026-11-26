import React from 'react';
import { TallyBalanceEquation, formatPaiseToINR } from '@yorbalance/shared';

interface Props {
  totals: {
    qty: number;
    taxable_paise: number;
    gst_paise: number;
    total_paise: number;
    produced_qty: number;
  };
  purchaseTotals?: {
    qty: number;
    taxable_paise: number;
    gst_paise: number;
    total_paise: number;
  };
  showPurchases?: boolean;
  equation: TallyBalanceEquation;
  hsnLabel?: string;
}

export const StockBalanceCard: React.FC<Props> = ({
  totals,
  purchaseTotals,
  showPurchases = false,
  equation,
  hsnLabel
}) => {
  const diff = equation.variance;
  const diffBadge =
    diff === null
      ? 'No physical count'
      : diff === 0
      ? 'Counted = Book'
      : diff > 0
      ? `Counted +${diff} vs book`
      : `Counted ${diff} vs book`;

  const diffCls =
    diff === null
      ? 'bg-slate-100 text-slate-600'
      : diff === 0
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-amber-50 text-amber-800';

  const rawWithPolishers = equation.polish_out - equation.polish_in;
  const polishError = rawWithPolishers < 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total sales amount</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900 tabular-nums">
            {formatPaiseToINR(totals.total_paise, true)}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            Taxable {formatPaiseToINR(totals.taxable_paise, true)} + GST {formatPaiseToINR(totals.gst_paise, true)}
          </p>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Sarees sold</p>
          <p className="mt-1 text-2xl font-extrabold text-indigo-700 tabular-nums">{totals.qty}</p>
          <p className="mt-1 text-xs text-slate-500">Filtered bill lines</p>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Produced / received</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-700 tabular-nums">{totals.produced_qty}</p>
          <p className="mt-1 text-xs text-slate-500">Production + polish received</p>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Balance in stock</p>
          <p className={`mt-1 text-2xl font-extrabold tabular-nums ${equation.book_balance < 0 ? 'text-rose-700' : 'text-slate-900'}`}>
            {equation.book_balance}
          </p>
          <span className={`mt-1 inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${diffCls}`}>
            {diffBadge}
          </span>
        </div>
      </div>

      {showPurchases && purchaseTotals && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white border border-slate-200 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total purchase amount</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900 tabular-nums">
              {formatPaiseToINR(purchaseTotals.total_paise, true)}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              Taxable {formatPaiseToINR(purchaseTotals.taxable_paise, true)} + GST {formatPaiseToINR(purchaseTotals.gst_paise, true)}
            </p>
          </div>
          <div className="rounded-2xl bg-white border border-slate-200 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Sarees purchased</p>
            <p className="mt-1 text-2xl font-extrabold text-sky-700 tabular-nums">{purchaseTotals.qty}</p>
            <p className="mt-1 text-xs text-slate-500">Filtered purchase lines</p>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-white border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-bold text-slate-900">
            Stock balance equation {hsnLabel ? `· HSN ${hsnLabel}*` : '· All HSNs'}
          </h3>
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full tabular-nums ${
              polishError
                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                : 'text-indigo-700 bg-indigo-50'
            }`}
          >
            {polishError ? '⚠ ' : ''}With polishers: {rawWithPolishers} ({equation.polish_out} out − {equation.polish_in} back)
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center">
          {[
            { label: 'Opening', val: equation.opening },
            { label: '+ Purchased', val: equation.purchased - equation.purchase_returns },
            { label: '+ Produced', val: equation.produced },
            { label: '− Sold', val: equation.sold },
            { label: '+ Sale returns', val: equation.sale_returns },
            { label: '+ Adjustments', val: equation.count_adjust },
            { label: '= Book balance', val: equation.book_balance, highlight: true }
          ].map(item => (
            <div
              key={item.label}
              className={`rounded-xl p-2.5 border ${
                item.highlight ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200/80'
              }`}
            >
              <p className="text-[11px] font-bold uppercase text-slate-500">{item.label}</p>
              <p className={`mt-0.5 text-lg font-extrabold tabular-nums ${item.highlight ? 'text-indigo-800' : 'text-slate-900'}`}>
                {item.val}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
