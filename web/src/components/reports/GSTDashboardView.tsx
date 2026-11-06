import React from 'react';
import { GSTDashboardData, formatINR } from '@yorbalance/shared';
import {
  FileCheck,
  TrendingUp,
  Receipt,
  Scale,
  AlertTriangle
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';

interface GSTDashboardViewProps {
  data: GSTDashboardData | null;
  disclaimer?: string;
  loading?: boolean;
}

export const GSTDashboardView: React.FC<GSTDashboardViewProps> = ({
  data,
  disclaimer,
  loading = false
}) => {
  if (loading) {
    return (
      <div className="bg-white rounded-3xl p-6 border border-slate-200 animate-pulse space-y-4">
        <div className="h-24 bg-slate-100 rounded-2xl" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-64 bg-slate-100 rounded-2xl" />
          <div className="h-64 bg-slate-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { summary, tax_breakdown, charts } = data;

  const totalOutput = tax_breakdown.output_cgst + tax_breakdown.output_sgst + tax_breakdown.output_igst;
  const totalInput = tax_breakdown.input_cgst + tax_breakdown.input_sgst + tax_breakdown.input_igst;
  const netCgst = Math.max(0, tax_breakdown.output_cgst - tax_breakdown.input_cgst);
  const netSgst = Math.max(0, tax_breakdown.output_sgst - tax_breakdown.input_sgst);
  const netIgst = Math.max(0, tax_breakdown.output_igst - tax_breakdown.input_igst);
  const netTotal = Math.max(0, totalOutput - totalInput);

  return (
    <div className="space-y-6">
      {/* Statutory Disclaimer Banner */}
      <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-4 flex items-start gap-3 text-amber-900 shadow-xs">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm leading-relaxed">
          <strong className="font-semibold block text-amber-950 mb-0.5">Statutory GST Disclaimer:</strong>
          {disclaimer ||
            'GST analytics and tax calculations shown in YorLedger are accounting summaries and must not be presented as proof that a GST return has been filed. All figures must be reviewed and reconciled with your physical invoices by your chartered accountant or GST tax consultant prior to filing GSTR-1, GSTR-3B, or CMP-08.'}
        </div>
      </div>

      {/* 4 Primary Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold uppercase tracking-wider text-slate-400">Total Taxable Sales</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <span className="font-serif-display text-2xl font-bold text-slate-900 block mt-2">
            {formatINR(summary.total_taxable_sales)}
          </span>
          <span className="text-sm text-slate-500 mt-1 block">Net outward taxable supplies</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold uppercase tracking-wider text-purple-700">Output GST Liability</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <span className="font-serif-display text-2xl font-bold text-purple-900 block mt-2">
            {formatINR(summary.output_gst)}
          </span>
          <span className="text-sm text-purple-700/80 mt-1 block font-medium">GSTR-1 outward tax liability</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold uppercase tracking-wider text-emerald-700">Eligible Input Tax Credit</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <FileCheck className="w-4 h-4" />
            </div>
          </div>
          <span className="font-serif-display text-2xl font-bold text-emerald-700 block mt-2">
            {formatINR(summary.eligible_itc)}
          </span>
          <span className="text-sm text-emerald-600/80 mt-1 block font-medium">From registered GSTIN purchases</span>
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-purple-950 text-white p-5 rounded-3xl shadow-md shadow-slate-950/20 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold uppercase tracking-wider text-purple-200">Net GST Payable</span>
            <div className="w-8 h-8 rounded-xl bg-white/10 text-amber-300 flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <span className="font-serif-display text-2xl font-bold text-white block mt-2">
            {formatINR(summary.net_gst_payable)}
          </span>
          <span className="text-sm text-purple-200/80 mt-1 block">
            {summary.output_gst > summary.eligible_itc ? 'Output Tax − Claimable ITC' : 'Credit Balance Available'}
          </span>
        </div>
      </div>

      {/* Tax Breakdown Matrix */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-serif-display text-sm font-bold text-slate-900">GST Component Reconciliation Matrix</h3>
            <p className="text-sm text-slate-500">Output tax collected vs input credit claimed by statutory component.</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider text-sm">
              <tr>
                <th className="py-3 px-6">Tax Category</th>
                <th className="py-3 px-6 text-right">CGST (Central Tax)</th>
                <th className="py-3 px-6 text-right">SGST (State Tax)</th>
                <th className="py-3 px-6 text-right">IGST (Integrated Tax)</th>
                <th className="py-3 px-6 text-right">Total Aggregate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="hover:bg-slate-50/50">
                <td className="py-3.5 px-6 font-semibold text-slate-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block" />
                  Output Tax Liability (Sales)
                </td>
                <td className="py-3.5 px-6 text-right font-mono text-slate-800">{formatINR(tax_breakdown.output_cgst)}</td>
                <td className="py-3.5 px-6 text-right font-mono text-slate-800">{formatINR(tax_breakdown.output_sgst)}</td>
                <td className="py-3.5 px-6 text-right font-mono text-slate-800">{formatINR(tax_breakdown.output_igst)}</td>
                <td className="py-3.5 px-6 text-right font-mono font-bold text-purple-900">{formatINR(totalOutput)}</td>
              </tr>
              <tr className="hover:bg-slate-50/50">
                <td className="py-3.5 px-6 font-semibold text-emerald-800 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  Input Tax Credit (Purchases)
                </td>
                <td className="py-3.5 px-6 text-right font-mono text-emerald-700">{formatINR(tax_breakdown.input_cgst)}</td>
                <td className="py-3.5 px-6 text-right font-mono text-emerald-700">{formatINR(tax_breakdown.input_sgst)}</td>
                <td className="py-3.5 px-6 text-right font-mono text-emerald-700">{formatINR(tax_breakdown.input_igst)}</td>
                <td className="py-3.5 px-6 text-right font-mono font-bold text-emerald-700">{formatINR(totalInput)}</td>
              </tr>
              <tr className="bg-slate-50/90 font-bold border-t-2 border-slate-200">
                <td className="py-3.5 px-6 text-slate-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-900 inline-block" />
                  Net Tax Payable (Challan)
                </td>
                <td className="py-3.5 px-6 text-right font-mono text-slate-900">{formatINR(netCgst)}</td>
                <td className="py-3.5 px-6 text-right font-mono text-slate-900">{formatINR(netSgst)}</td>
                <td className="py-3.5 px-6 text-right font-mono text-slate-900">{formatINR(netIgst)}</td>
                <td className="py-3.5 px-6 text-right font-mono font-extrabold text-purple-700">{formatINR(netTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 5 Recharts Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Monthly Sales vs Purchases Bar Chart */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-serif-display text-sm font-bold text-slate-900">Monthly Sales vs Purchases (₹)</h4>
            <span className="text-sm text-slate-400">Turnover Velocity</span>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.monthly_sales_vs_purchases} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, '']}
                  contentStyle={{ borderRadius: '1rem', border: '1px solid #e2e8f0', fontSize: '11px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="sales" name="Sales Turnover" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="purchases" name="Purchases" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Monthly Output GST Trend */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-serif-display text-sm font-bold text-slate-900">Monthly Output GST Liability Trend (₹)</h4>
            <span className="text-sm text-purple-600 font-medium">GSTR-1 Trend</span>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts.monthly_output_gst_trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="outputTaxGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Output GST']}
                  contentStyle={{ borderRadius: '1rem', border: '1px solid #e2e8f0', fontSize: '11px' }}
                />
                <Area type="monotone" dataKey="output_gst" stroke="#7c3aed" strokeWidth={2.5} fillOpacity={1} fill="url(#outputTaxGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Monthly Input Tax Credit Trend */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-serif-display text-sm font-bold text-slate-900">Monthly Input Tax Credit (ITC) Trend (₹)</h4>
            <span className="text-sm text-emerald-600 font-medium">GSTR-2B Inflow</span>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts.monthly_itc_trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="itcGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Eligible ITC']}
                  contentStyle={{ borderRadius: '1rem', border: '1px solid #e2e8f0', fontSize: '11px' }}
                />
                <Area type="monotone" dataKey="eligible_itc" stroke="#059669" strokeWidth={2.5} fillOpacity={1} fill="url(#itcGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: CGST vs SGST vs IGST Component Comparison */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-serif-display text-sm font-bold text-slate-900">CGST / SGST / IGST Tax Heads Comparison (₹)</h4>
            <span className="text-sm text-slate-400">Jurisdiction Balance</span>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.tax_component_comparison} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="component" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, '']}
                  contentStyle={{ borderRadius: '1rem', border: '1px solid #e2e8f0', fontSize: '11px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="output" name="Output Tax" fill="#a855f7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="input" name="Input Credit" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 5: Monthly Net GST Payable Trend (Full Width) */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-serif-display text-sm font-bold text-slate-900">Monthly Net GST Cash Challan Payable (₹)</h4>
              <p className="text-sm text-slate-400">Net tax after offsetting eligible ITC from output sales tax</p>
            </div>
            <span className="text-sm font-mono font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200">
              GSTR-3B Net Cash
            </span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={charts.monthly_net_payable_trend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Net Cash Payable']}
                  contentStyle={{ borderRadius: '1rem', border: '1px solid #e2e8f0', fontSize: '11px' }}
                />
                <Line
                  type="monotone"
                  dataKey="net_payable"
                  stroke="#6366f1"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#6366f1' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
