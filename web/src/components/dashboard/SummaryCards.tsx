import React from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardSummary, formatINR } from '@yorbalance/shared';
import {
  FileText,
  Clock,
  CheckCircle2,
  TrendingUp,
  Scale,
  ArrowUpDown,
  ArrowRight,
  Receipt,
  Wallet,
  AlertCircle
} from 'lucide-react';

interface SummaryCardsProps {
  summary: DashboardSummary | null;
  loading?: boolean;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ summary, loading = false }) => {
  const navigate = useNavigate();

  if (loading || !summary) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="bg-white rounded-3xl p-5 border border-slate-200 animate-pulse space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-slate-100" />
              <div className="w-16 h-5 rounded-full bg-slate-100" />
            </div>
            <div className="w-24 h-4 rounded bg-slate-100" />
            <div className="w-36 h-7 rounded bg-slate-200" />
            <div className="w-28 h-3 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  const isNetPositive = summary.net_balance >= 0;

  const cards = [
    {
      id: 'total_transactions',
      title: 'Total Transactions',
      value: `${summary.total_transactions} Bills`,
      subtext: 'Recorded in period',
      tag: 'All Bill Types',
      icon: Receipt,
      iconBg: 'bg-purple-50 text-purple-600 border border-purple-100',
      actionText: 'View All Bills',
      onClick: () => navigate('/history')
    },
    {
      id: 'pending_dues',
      title: 'Pending Dues',
      value: formatINR(summary.pending_amount),
      subtext: 'Unsettled across parties',
      tag: 'Action Required',
      tagColor: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: Clock,
      iconBg: 'bg-amber-50 text-amber-600 border border-amber-100',
      actionText: 'Open Dues Manager',
      onClick: () => navigate('/dues')
    },
    {
      id: 'settled_transactions',
      title: 'Settled Amount',
      value: formatINR(summary.settled_amount),
      subtext: 'Completed collections & payments',
      tag: 'Settled 100%',
      tagColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: CheckCircle2,
      iconBg: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
      actionText: 'Review Clearances',
      onClick: () => navigate('/dues?tab=completed')
    },
    {
      id: 'total_value',
      title: 'Total Value',
      value: formatINR(summary.total_value),
      subtext: 'Aggregate transaction volume',
      tag: 'Gross Turnover',
      icon: TrendingUp,
      iconBg: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
      actionText: 'Inspect Ledger',
      onClick: () => navigate('/ledger')
    },
    {
      id: 'net_balance',
      title: 'Net Balance',
      value: formatINR(summary.net_balance),
      subtext: isNetPositive ? 'Sales exceed purchases' : 'Purchases exceed sales',
      tag: isNetPositive ? 'Surplus' : 'Deficit',
      tagColor: isNetPositive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200',
      valueColor: isNetPositive ? 'text-emerald-600' : 'text-rose-600',
      icon: Scale,
      iconBg: isNetPositive ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100',
      actionText: 'Explore P&L Analysis',
      onClick: () => navigate('/analytics')
    },
    {
      id: 'sales_vs_purchases',
      title: 'Sales vs Purchases',
      value: `S: ${formatINR(summary.total_sales)}`,
      subtext: `P: ${formatINR(summary.total_purchases)} (incl. job work)`,
      tag: summary.period_label,
      icon: ArrowUpDown,
      iconBg: 'bg-blue-50 text-blue-600 border border-blue-100',
      actionText: 'Detailed Comparison',
      onClick: () => navigate('/analytics?tab=comparison')
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
      {cards.map(c => {
        const Icon = c.icon;
        return (
          <div
            key={c.id}
            onClick={c.onClick}
            className="group bg-white rounded-3xl p-5 border border-slate-200/90 hover:border-purple-400 hover:shadow-xl hover:shadow-purple-950/5 transition-all duration-200 cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${c.iconBg}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${c.tagColor || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                  {c.tag}
                </span>
              </div>

              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                {c.title}
              </h4>
              <p className={`text-xl sm:text-2xl font-serif-display font-extrabold tracking-tight ${c.valueColor || 'text-slate-900'}`}>
                {c.value}
              </p>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">
                {c.subtext}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-purple-600 group-hover:text-purple-700">
              <span>{c.actionText}</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </div>
        );
      })}
    </div>
  );
};

