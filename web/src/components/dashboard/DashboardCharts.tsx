import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { DashboardCharts as IDashboardCharts, formatINR } from '@yorbalance/shared';
import { TrendingUp, BarChart3, PieChart as PieIcon, ArrowUpRight, ArrowDownRight, Scale } from 'lucide-react';

interface DashboardChartsProps {
  charts: IDashboardCharts | null;
  loading?: boolean;
}

const COLORS = {
  sales: '#7c3aed',      // Purple
  purchases: '#f59e0b',  // Amber
  settled: '#10b981',    // Emerald
  pending: '#f43f5e'     // Rose
};

const CustomINRTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 text-white text-xs p-3 rounded-2xl shadow-xl border border-slate-700 min-w-[150px]">
        <p className="font-bold border-b border-slate-700 pb-1 mb-2 text-slate-300">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center justify-between gap-3 py-0.5">
            <span className="flex items-center gap-1.5 font-medium text-slate-300">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
              {entry.name}:
            </span>
            <span className="font-bold text-white font-mono">
              {formatINR(Number(entry.value))}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export const DashboardCharts: React.FC<DashboardChartsProps> = ({ charts, loading = false }) => {
  if (loading || !charts) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 h-80 animate-pulse bg-slate-100/50" />
          <div className="bg-white rounded-3xl p-6 border border-slate-200 h-80 animate-pulse bg-slate-100/50" />
        </div>
        <div className="bg-white rounded-3xl p-6 border border-slate-200 h-64 animate-pulse bg-slate-100/50" />
      </div>
    );
  }

  const { summary, sales_vs_purchases, sales_trend, pending_vs_settled } = charts;

  // Format tick numbers (e.g. 100000 -> 1L, 50000 -> 50k)
  const formatYAxisTick = (val: number) => {
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`;
    if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
    if (val >= 1000) return `₹${(val / 1000).toFixed(0)}k`;
    return `₹${val}`;
  };

  const totalDuesAndSettled = pending_vs_settled.reduce((acc, curr) => acc + curr.value, 0) || 1;

  return (
    <div className="space-y-6">
      {/* ----------------- Top 3 Summary Stat Strips ----------------- */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 rounded-3xl p-5 text-white border border-slate-800 shadow-xl shadow-purple-950/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-purple-300">
              Transaction Balance Overview
            </span>
            <h3 className="text-base font-serif-display font-bold text-white mt-0.5">
              Financial Health & Cash Flow Ratio
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs">
            <div className="bg-slate-800/80 rounded-2xl px-4 py-2 border border-slate-700">
              <span className="text-slate-400 block text-[10px] font-semibold uppercase">Total Sales Turnover</span>
              <strong className="text-sm sm:text-base text-emerald-400 font-serif-display">
                {formatINR(summary.total_sales)}
              </strong>
            </div>

            <div className="bg-slate-800/80 rounded-2xl px-4 py-2 border border-slate-700">
              <span className="text-slate-400 block text-[10px] font-semibold uppercase">Purchases & Job Work</span>
              <strong className="text-sm sm:text-base text-amber-400 font-serif-display">
                {formatINR(summary.total_purchases)}
              </strong>
            </div>

            <div className="bg-slate-800/80 rounded-2xl px-4 py-2 border border-slate-700">
              <span className="text-slate-400 block text-[10px] font-semibold uppercase">Net Operating Surplus</span>
              <strong className={`text-sm sm:text-base font-serif-display ${summary.net_balance >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                {formatINR(summary.net_balance)}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* ----------------- Charts Grid ----------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Sales vs Purchases (Bar Chart) - 2 cols on desktop */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Sales vs Purchases Comparison</h4>
                <p className="text-[11px] text-slate-500">Monthly breakdown of gross revenue against procurement in INR</p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="w-2.5 h-2.5 rounded-sm bg-purple-600" /> Sales
              </span>
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Purchases
              </span>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sales_vs_purchases} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={formatYAxisTick}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  width={60}
                />
                <Tooltip content={<CustomINRTooltip />} />
                <Bar
                  dataKey="sales"
                  name="Sales"
                  fill={COLORS.sales}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={36}
                />
                <Bar
                  dataKey="purchases"
                  name="Purchases"
                  fill={COLORS.purchases}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={36}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Pending vs Settled (Donut Chart) - 1 col on desktop */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <PieIcon className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Dues vs Clearances</h4>
                <p className="text-[11px] text-slate-500">Settled collections vs pending dues</p>
              </div>
            </div>
          </div>

          <div className="h-52 w-full relative flex items-center justify-center my-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pending_vs_settled}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={5}
                  dataKey="value"
                >
                  <Cell fill={COLORS.settled} />
                  <Cell fill={COLORS.pending} />
                </Pie>
                <Tooltip content={<CustomINRTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Recovery</span>
              <span className="text-lg font-serif-display font-extrabold text-slate-900">
                {Math.round((pending_vs_settled[0]?.value / totalDuesAndSettled) * 100)}%
              </span>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
            {pending_vs_settled.map((item, idx) => {
              const isSettled = item.name === 'Settled';
              const percent = Math.round((item.value / totalDuesAndSettled) * 100);
              return (
                <div key={item.name} className="flex items-center justify-between p-2 rounded-xl bg-slate-50">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: isSettled ? COLORS.settled : COLORS.pending }}
                    />
                    <span className="font-semibold text-slate-700">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-slate-900 block font-mono">{formatINR(item.value)}</span>
                    <span className="text-[10px] text-slate-400 font-semibold">{percent}% ({item.count} bills)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Chart 2: Monthly Sales Trend (Line/Area Chart) */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">Sales Velocity Trend</h4>
              <p className="text-[11px] text-slate-500">Invoice volume and sales billing timeline for selected period</p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200 self-start sm:self-auto">
            Live Daily Velocity
          </span>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sales_trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.sales} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={COLORS.sales} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748b', fontSize: 11 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tickFormatter={formatYAxisTick}
                tick={{ fill: '#64748b', fontSize: 11 }}
                width={60}
              />
              <Tooltip content={<CustomINRTooltip />} />
              <Area
                type="monotone"
                dataKey="sales"
                name="Daily Sales"
                stroke={COLORS.sales}
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#salesGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

