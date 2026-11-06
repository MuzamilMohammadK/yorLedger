import React from 'react';
import { PurchaseLedgerReport, formatINR } from '@yorbalance/shared';
import { ShoppingBag, AlertTriangle, ShieldCheck } from 'lucide-react';

interface PurchaseLedgerTableProps {
  report: PurchaseLedgerReport | null;
  loading?: boolean;
}

export const PurchaseLedgerTable: React.FC<PurchaseLedgerTableProps> = ({ report, loading = false }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-3xl p-6 border border-slate-200 animate-pulse space-y-4">
        <div className="h-20 bg-slate-100 rounded-2xl" />
        <div className="h-64 bg-slate-100 rounded-2xl" />
      </div>
    );
  }

  if (!report || report.items.length === 0) {
    return (
      <div className="bg-white rounded-3xl p-12 border border-slate-200 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto">
          <ShoppingBag className="w-6 h-6" />
        </div>
        <h3 className="font-serif-display text-base font-bold text-slate-800">No Purchase Bills Recorded</h3>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">
          There are no purchase transactions matching the selected date range or filter criteria.
        </p>
      </div>
    );
  }

  const { totals, items } = report;

  return (
    <div className="space-y-6">
      {/* Summary KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-sm font-bold uppercase tracking-wider text-slate-400 block">Total Purchases</span>
          <span className="font-serif-display text-base font-bold text-slate-900 block mt-0.5">
            {formatINR(totals.total_purchase_value)}
          </span>
          <span className="text-sm text-slate-500">{items.length} Bills</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-sm font-bold uppercase tracking-wider text-slate-400 block">Taxable Base</span>
          <span className="font-serif-display text-base font-bold text-slate-800 block mt-0.5">
            {formatINR(totals.total_taxable_value)}
          </span>
          <span className="text-sm text-slate-500">Net Base</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-sm font-bold uppercase tracking-wider text-slate-400 block">Input CGST</span>
          <span className="font-mono text-sm font-semibold text-slate-700 block mt-0.5">
            {formatINR(totals.total_cgst)}
          </span>
          <span className="text-sm text-slate-400">Central Tax</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-sm font-bold uppercase tracking-wider text-slate-400 block">Input SGST</span>
          <span className="font-mono text-sm font-semibold text-slate-700 block mt-0.5">
            {formatINR(totals.total_sgst)}
          </span>
          <span className="text-sm text-slate-400">State Tax</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-sm font-bold uppercase tracking-wider text-slate-400 block">Input IGST</span>
          <span className="font-mono text-sm font-semibold text-slate-700 block mt-0.5">
            {formatINR(totals.total_igst)}
          </span>
          <span className="text-sm text-slate-400">Integrated</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-sm font-bold uppercase tracking-wider text-rose-500 block">Returns Deducted</span>
          <span className="font-mono text-sm font-semibold text-rose-600 block mt-0.5">
            -{formatINR(totals.total_returns)}
          </span>
          <span className="text-sm text-slate-400">Credit Notes</span>
        </div>

        <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200/80 shadow-xs col-span-2 sm:col-span-1">
          <span className="text-sm font-bold uppercase tracking-wider text-emerald-800 block flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-600" /> Eligible ITC
          </span>
          <span className="font-serif-display text-base font-bold text-emerald-700 block mt-0.5">
            {formatINR(totals.eligible_itc)}
          </span>
          <span className="text-sm text-emerald-600/90 font-medium">Claimable in 3B</span>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-serif-display text-sm font-bold text-slate-900">Purchase Invoices & Input Tax Register</h3>
            <p className="text-sm text-slate-500">Itemized supplier bills, tax heads, returns adjustment and claimable ITC.</p>
          </div>
          <span className="text-sm font-semibold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
            {items.length} Invoices
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-sm">
              <tr>
                <th className="py-3 px-4">Date / Bill #</th>
                <th className="py-3 px-4">Supplier & GSTIN</th>
                <th className="py-3 px-4 text-right">Taxable Val</th>
                <th className="py-3 px-4 text-right">CGST</th>
                <th className="py-3 px-4 text-right">SGST</th>
                <th className="py-3 px-4 text-right">IGST</th>
                <th className="py-3 px-4 text-right">Net Bill</th>
                <th className="py-3 px-4 text-right">Returns</th>
                <th className="py-3 px-4 text-right">Eligible ITC</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 px-4">
                    <span className="font-semibold text-slate-900 block font-mono">
                      {item.invoice_number || 'N/A'}
                    </span>
                    <span className="text-sm text-slate-400">
                      {new Date(item.bill_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </td>
                  <td className="py-3 px-4 max-w-[200px]">
                    <span className="font-semibold text-slate-900 block truncate" title={item.supplier_name}>
                      {item.supplier_name}
                    </span>
                    {item.supplier_gstin ? (
                      <span className="font-mono text-sm text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 inline-block mt-0.5">
                        {item.supplier_gstin}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sm text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mt-0.5">
                        <AlertTriangle className="w-2.5 h-2.5" /> Unregistered (0 ITC)
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-800">
                    {formatINR(item.taxable_value)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-600">
                    {item.cgst > 0 ? formatINR(item.cgst) : '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-600">
                    {item.sgst > 0 ? formatINR(item.sgst) : '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-600">
                    {item.igst > 0 ? formatINR(item.igst) : '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold font-mono text-slate-900">
                    {formatINR(item.net_purchase_amount)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-rose-600">
                    {item.returns > 0 ? `-${formatINR(item.returns)}` : '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                    {formatINR(item.eligible_itc)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-sm font-bold uppercase tracking-wider ${
                        item.payment_status === 'SETTLED'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : item.payment_status === 'PARTIAL'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : item.payment_status === 'OVERDUE'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {item.payment_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Table Footer Totals */}
            <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-200 text-slate-900">
              <tr>
                <td className="py-3 px-4" colSpan={2}>Grand Totals ({items.length} Invoices)</td>
                <td className="py-3 px-4 text-right font-mono">{formatINR(totals.total_taxable_value)}</td>
                <td className="py-3 px-4 text-right font-mono">{formatINR(totals.total_cgst)}</td>
                <td className="py-3 px-4 text-right font-mono">{formatINR(totals.total_sgst)}</td>
                <td className="py-3 px-4 text-right font-mono">{formatINR(totals.total_igst)}</td>
                <td className="py-3 px-4 text-right font-mono">{formatINR(totals.total_purchase_value)}</td>
                <td className="py-3 px-4 text-right font-mono text-rose-600">-{formatINR(totals.total_returns)}</td>
                <td className="py-3 px-4 text-right font-mono text-emerald-700">{formatINR(totals.eligible_itc)}</td>
                <td className="py-3 px-4"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {items.map(item => (
          <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-mono font-bold text-sm text-slate-900 block">{item.invoice_number || 'N/A'}</span>
                <span className="text-sm text-slate-400">
                  {new Date(item.bill_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-sm font-bold uppercase tracking-wider ${
                  item.payment_status === 'SETTLED'
                    ? 'bg-emerald-50 text-emerald-700'
                    : item.payment_status === 'PARTIAL'
                    ? 'bg-amber-50 text-amber-700'
                    : item.payment_status === 'OVERDUE'
                    ? 'bg-rose-50 text-rose-700'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {item.payment_status}
              </span>
            </div>

            <div className="pt-1 border-t border-slate-100">
              <span className="font-medium text-sm text-slate-900 block">{item.supplier_name}</span>
              {item.supplier_gstin ? (
                <span className="font-mono text-sm text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded inline-block mt-0.5">
                  GSTIN: {item.supplier_gstin}
                </span>
              ) : (
                <span className="text-sm text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded inline-block mt-0.5">
                  Unregistered (0 ITC)
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm pt-1 border-t border-slate-100">
              <div>
                <span className="text-sm text-slate-400 block">Taxable Base</span>
                <span className="font-mono font-medium text-slate-800">{formatINR(item.taxable_value)}</span>
              </div>
              <div>
                <span className="text-sm text-slate-400 block">Total Tax</span>
                <span className="font-mono font-medium text-slate-800">{formatINR(item.total_gst)}</span>
              </div>
              <div>
                <span className="text-sm text-slate-400 block">Net Amount</span>
                <span className="font-mono font-bold text-slate-900">{formatINR(item.net_purchase_amount)}</span>
              </div>
              <div>
                <span className="text-sm text-emerald-700 font-semibold block">Eligible ITC</span>
                <span className="font-mono font-bold text-emerald-700">{formatINR(item.eligible_itc)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
