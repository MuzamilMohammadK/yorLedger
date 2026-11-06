import React from 'react';
import { ArtisanJobWorkReport, formatINR } from '@yorbalance/shared';
import { Scissors } from 'lucide-react';

interface JobWorkLedgerTableProps {
  report: ArtisanJobWorkReport | null;
  loading?: boolean;
}

export const JobWorkLedgerTable: React.FC<JobWorkLedgerTableProps> = ({ report, loading = false }) => {
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
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
          <Scissors className="w-6 h-6" />
        </div>
        <h3 className="font-serif-display text-base font-bold text-slate-800">No Job-Work Transactions</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          There are no artisan weaving, dyeing, zari or embroidery job-work transactions in this period.
        </p>
      </div>
    );
  }

  const { totals, items, artisan_summaries } = report;

  return (
    <div className="space-y-6">
      {/* Summary KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Job Work Value</span>
          <span className="font-serif-display text-base font-bold text-slate-900 block mt-0.5">
            {formatINR(totals.total_job_work_value)}
          </span>
          <span className="text-[10px] text-slate-500">{items.length} Work Orders</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 block">Total GST on Job Work</span>
          <span className="font-mono text-sm font-semibold text-purple-900 block mt-0.5">
            {formatINR(totals.total_gst)}
          </span>
          <span className="text-[10px] text-purple-600">Applicable ITC</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">Total Payments Disbursed</span>
          <span className="font-mono text-sm font-semibold text-emerald-700 block mt-0.5">
            {formatINR(totals.total_payments)}
          </span>
          <span className="text-[10px] text-slate-400">Settled to Artisans</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 block">Pending Artisan Dues</span>
          <span className="font-serif-display text-base font-bold text-rose-600 block mt-0.5">
            {formatINR(totals.total_outstanding)}
          </span>
          <span className="text-[10px] text-rose-500/80 font-medium">{artisan_summaries.length} Active Artisans</span>
        </div>
      </div>

      {/* Artisan-Wise Breakdown Cards */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
        <h3 className="font-serif-display text-sm font-bold text-slate-900">Artisan Production & Dues Summary</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {artisan_summaries.map(art => (
            <div key={art.artisan_id} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-xs text-slate-900 block">{art.artisan_name}</span>
                  <span className="text-[10px] text-slate-400 font-mono">ID: {art.artisan_id.slice(0, 8)}</span>
                </div>
                <span className="text-[10px] font-bold bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">
                  {art.transaction_count} Orders
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-200/60">
                <div>
                  <span className="text-[10px] text-slate-400 block">Total Work</span>
                  <span className="font-mono font-semibold text-slate-800">{formatINR(art.total_job_work_value)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Paid</span>
                  <span className="font-mono font-semibold text-emerald-700">{formatINR(art.total_payments)}</span>
                </div>
                <div className="col-span-2 flex justify-between items-center pt-1 border-t border-slate-100">
                  <span className="text-[10px] text-rose-600 font-medium">Pending Due:</span>
                  <span className="font-mono font-bold text-rose-600">{formatINR(art.outstanding_amount)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Itemized Transactions Table */}
      <div className="hidden md:block bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-serif-display text-sm font-bold text-slate-900">Job-Work Transaction Register</h3>
            <p className="text-[11px] text-slate-500">Itemized work descriptions, fabric quantities, labor charges, and dues.</p>
          </div>
          <span className="text-xs font-semibold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
            {items.length} Records
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Date / Ref #</th>
                <th className="py-3 px-4">Artisan</th>
                <th className="py-3 px-4">Work Details</th>
                <th className="py-3 px-4 text-center">Qty</th>
                <th className="py-3 px-4 text-right">Job Amount</th>
                <th className="py-3 px-4 text-right">GST</th>
                <th className="py-3 px-4 text-right">Paid</th>
                <th className="py-3 px-4 text-right">Remaining Due</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 px-4">
                    <span className="font-semibold text-slate-900 block font-mono">
                      {item.job_work_reference || 'N/A'}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {new Date(item.transaction_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-semibold text-slate-900 block">{item.artisan_name}</span>
                    <span className="text-[10px] text-slate-400">Artisan</span>
                  </td>
                  <td className="py-3 px-4 max-w-[220px]">
                    <span className="text-slate-800 line-clamp-1" title={item.work_details}>
                      {item.work_details || 'Silk weaving / processing'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center font-mono text-slate-700">
                    {item.quantity || 1}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-medium text-slate-900">
                    {formatINR(item.job_work_amount)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-600">
                    {item.gst > 0 ? formatINR(item.gst) : '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-emerald-700">
                    {formatINR(item.amount_paid)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">
                    {item.outstanding_amount > 0 ? formatINR(item.outstanding_amount) : '—'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
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
            <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-200 text-slate-900">
              <tr>
                <td className="py-3 px-4" colSpan={4}>Totals ({items.length} Job-Work Bills)</td>
                <td className="py-3 px-4 text-right font-mono">{formatINR(totals.total_job_work_value)}</td>
                <td className="py-3 px-4 text-right font-mono">{formatINR(totals.total_gst)}</td>
                <td className="py-3 px-4 text-right font-mono text-emerald-700">{formatINR(totals.total_payments)}</td>
                <td className="py-3 px-4 text-right font-mono text-rose-600">{formatINR(totals.total_outstanding)}</td>
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
                <span className="font-mono font-bold text-xs text-slate-900 block">{item.job_work_reference || 'N/A'}</span>
                <span className="text-[10px] text-slate-400">
                  {new Date(item.transaction_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
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
              <span className="font-medium text-xs text-slate-900 block">{item.artisan_name}</span>
              <p className="text-[11px] text-slate-500 mt-0.5">{item.work_details || 'Job work order'}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100">
              <div>
                <span className="text-[10px] text-slate-400 block">Job Charge</span>
                <span className="font-mono font-bold text-slate-900">{formatINR(item.job_work_amount)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Quantity</span>
                <span className="font-mono font-medium text-slate-700">{item.quantity || 1} units</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Paid</span>
                <span className="font-mono font-medium text-emerald-700">{formatINR(item.amount_paid)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Remaining Due</span>
                <span className="font-mono font-bold text-rose-600">{formatINR(item.outstanding_amount)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
