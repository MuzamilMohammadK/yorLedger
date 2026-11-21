import React, { useState } from 'react';
import { Download, Printer, BarChart3, TrendingUp, Layers, Sparkles, Scale, Filter } from 'lucide-react';
import { StockProductionAnalysis, formatPaiseToINR, toCsv } from '@yorbalance/shared';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts';
import { shareFile } from '../../lib/platform';
import { todayIST } from '../../lib/data/util';
import { useAuth } from '../../context/AuthContext';

interface Props {
  analysis: StockProductionAnalysis;
  filter: { from: string; to: string };
  onFilterChange: (f: { from: string; to: string }) => void;
}

export const StockAnalyticsView: React.FC<Props> = ({ analysis, filter, onFilterChange }) => {
  const { shop } = useAuth();

  const handleExportCsv = async () => {
    const meta = {
      shop: shop?.name ?? 'Shop',
      gstin: shop?.gstin ?? '',
      period: `${filter.from} to ${filter.to}`,
      report: 'Stock & Production Analytics'
    };

    const monthlyRows = analysis.monthly_comparison.map(m => ({
      category: 'Monthly Comparison',
      identifier: m.month,
      metric_1: `Purchased: ${m.purchased}`,
      metric_2: `Produced: ${m.produced}`,
      metric_3: `Sold: ${m.sold}`
    }));

    const polishingRows = analysis.polishing_cost_by_person.map(p => ({
      category: 'Polishing by Person',
      identifier: p.person,
      metric_1: `Sarees: ${p.sarees}`,
      metric_2: `Cost (INR): ${p.cost_rupees}`,
      metric_3: ''
    }));

    const weaverRows = analysis.raw_material_by_weaver.map(w => ({
      category: 'Raw Material by Weaver',
      identifier: w.weaver,
      metric_1: `Yarn Issued (kg): ${w.kg.toFixed(2)}`,
      metric_2: '',
      metric_3: ''
    }));

    const allRows = [...monthlyRows, ...polishingRows, ...weaverRows];

    const csv = toCsv(
      meta,
      [
        { key: 'category', label: 'Report Section' },
        { key: 'identifier', label: 'Name / Period' },
        { key: 'metric_1', label: 'Detail 1' },
        { key: 'metric_2', label: 'Detail 2' },
        { key: 'metric_3', label: 'Detail 3' }
      ],
      allRows as any
    );

    await shareFile(new Blob([csv], { type: 'text/csv' }), `stock-production-analytics-${todayIST()}.csv`, 'Stock & Production Analytics');
  };

  return (
    <div className="space-y-6">
      {/* Date Filter & Export Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase">
            <Filter className="w-4 h-4 text-brand-900" />
            <span>Analysis Period:</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filter.from}
              onChange={e => onFilterChange({ ...filter, from: e.target.value })}
              className="h-9 px-3 rounded-xl border border-slate-300 text-xs font-medium focus:border-brand-700 focus:outline-none"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={filter.to}
              onChange={e => onFilterChange({ ...filter, to: e.target.value })}
              className="h-9 px-3 rounded-xl border border-slate-300 text-xs font-medium focus:border-brand-700 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="h-10 px-4 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center gap-2 shadow-sm transition-colors"
          >
            <Download className="w-4 h-4 text-brand-900" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="h-10 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* 5 Core Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total Stock Value</span>
          <span className="text-xl sm:text-2xl font-extrabold text-brand-900 block mt-2">
            {formatPaiseToINR(analysis.stock_value_paise)}
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block">Finished + Raw Material</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Sarees in Stock</span>
          <span className="text-xl sm:text-2xl font-extrabold text-slate-900 block mt-2">
            {analysis.sarees_in_stock}
          </span>
          <span className="text-[11px] text-emerald-600 font-semibold mt-1 block">Finished goods</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">With Weavers</span>
          <span className="text-xl sm:text-2xl font-extrabold text-amber-600 block mt-2">
            ~{analysis.sarees_with_weavers}
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block">Estimated on looms</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">At Polishing</span>
          <span className="text-xl sm:text-2xl font-extrabold text-orange-600 block mt-2">
            {analysis.sarees_at_polishing}
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block">Awaiting return</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm col-span-2 sm:col-span-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Raw Material</span>
          <span className="text-xl sm:text-2xl font-extrabold text-slate-900 block mt-2">
            {analysis.raw_material_balance_kg.toFixed(2)} kg
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block">Silk yarn, zari, etc.</span>
        </div>
      </div>

      {/* Recharts Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Monthly Purchases vs Production vs Sales */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-base font-bold text-slate-900">Purchases vs Production vs Sales</h4>
              <p className="text-xs text-slate-500">6-month saree volume trends</p>
            </div>
            <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-900 flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>
          <div className="h-64 sm:h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analysis.monthly_comparison} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', borderColor: '#e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar dataKey="purchased" name="Purchased" fill="#0284c7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="produced" name="Produced (Weaver)" fill="#059669" radius={[4, 4, 0, 0]} />
                <Bar dataKey="sold" name="Sold" fill="#d97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Polishing Cost by Person */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-base font-bold text-slate-900">Polishing Cost by Person</h4>
              <p className="text-xs text-slate-500">Total charge in ₹ per polishing artisan</p>
            </div>
            <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="h-64 sm:h-72 w-full">
            {analysis.polishing_cost_by_person.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No polishing data recorded yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analysis.polishing_cost_by_person} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="person" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Cost']}
                    contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', borderColor: '#e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  />
                  <Bar dataKey="cost_rupees" name="Polishing Cost (₹)" fill="#ea580c" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 3: Raw Material Issued per Weaver */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-base font-bold text-slate-900">Raw Material Issued per Weaver (kg)</h4>
              <p className="text-xs text-slate-500">Distribution of silk yarn & materials across weavers</p>
            </div>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div className="h-64 sm:h-72 w-full">
            {analysis.raw_material_by_weaver.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No yarn issued to weavers yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analysis.raw_material_by_weaver} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="weaver" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(val: any) => [`${Number(val).toFixed(2)} kg`, 'Yarn Issued']}
                    contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', borderColor: '#e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  />
                  <Bar dataKey="kg" name="Yarn Issued (kg)" fill="#b45309" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
