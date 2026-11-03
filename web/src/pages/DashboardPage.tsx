import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { DateRangeFilter } from '../components/dashboard/DateRangeFilter';
import { SummaryCards } from '../components/dashboard/SummaryCards';
import { DashboardCharts } from '../components/dashboard/DashboardCharts';
import { RecentTransactionsTable } from '../components/dashboard/RecentTransactionsTable';
import {
  DashboardSummary,
  DashboardCharts as IDashboardCharts,
  Transaction,
  DateRangeOption
} from '@yorbalance/shared';
import {
  Store,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  HelpCircle,
  ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const DashboardPage: React.FC = () => {
  const { shop, user } = useAuth();

  const [period, setPeriod] = useState<DateRangeOption>('this_month');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [charts, setCharts] = useState<IDashboardCharts | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      else setRefreshing(true);
      setError(null);

      const [summaryRes, chartsRes, recentRes] = await Promise.all([
        api.getDashboardSummary(period),
        api.getDashboardCharts(period),
        api.getRecentTransactions(10)
      ]);

      setSummary(summaryRes.summary);
      setCharts(chartsRes.charts);
      setTransactions(recentRes.transactions || []);
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
      setError(err.message || 'Unable to retrieve dashboard metrics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => {
    fetchDashboardData(false);
  }, [fetchDashboardData]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Merchant Welcome & Business Credentials Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-brand-950 to-purple-950 rounded-3xl p-6 sm:p-7 text-white shadow-xl shadow-purple-950/15 border border-slate-800">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approved Silk Merchant
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white/10 text-slate-200">
                  State Code: {shop?.state_code || '37'}
                </span>
                <span className="text-xs text-purple-200/80">
                  Default GST: <strong>{((shop?.default_gst_bp || 500) / 100).toFixed(0)}%</strong>
                </span>
              </div>

              <h1 className="font-serif-display text-2xl sm:text-3xl font-extrabold tracking-tight">
                {shop?.name || 'Sri Lakshmi Silks & Sarees'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
                Proprietor: <strong>{shop?.owner_name || 'Ramesh Kumar'}</strong> • GSTIN: <span className="font-mono font-semibold">{shop?.gstin || '37AAACH7409R1ZZ'}</span> • Registered Address: <span>{shop?.address}</span>
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <Link
                to="/ledger"
                className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-amber-500 hover:from-purple-500 hover:to-amber-400 text-white font-bold text-xs shadow-lg shadow-purple-900/30 transition-all flex items-center gap-1.5"
              >
                <span>New Bill Entry</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Date Range Selection & Refresh Strip */}
        <DateRangeFilter
          selectedPeriod={period}
          onPeriodChange={newPeriod => setPeriod(newPeriod)}
          onRefresh={() => fetchDashboardData(true)}
          isRefreshing={refreshing}
        />

        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Summary Cards */}
        <SummaryCards summary={summary} loading={loading} />

        {/* Recharts Analytics Section */}
        <DashboardCharts charts={charts} loading={loading} />

        {/* Recent Transactions Table with Details Modal */}
        <RecentTransactionsTable transactions={transactions} loading={loading} />
      </div>
    </DashboardLayout>
  );
};
