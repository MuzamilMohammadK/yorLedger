import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import { AdminOverviewData } from '@yorbalance/shared';
import { adminApi } from '../../lib/adminApi';

const KpiCard: React.FC<{ label: string; value: string | number; trend: string; tone?: 'neutral' | 'amber' | 'rose' | 'emerald' }> = ({
  label,
  value,
  trend,
  tone = 'neutral'
}) => {
  const valCls =
    tone === 'amber'
      ? 'text-amber-700'
      : tone === 'rose'
      ? 'text-rose-700'
      : tone === 'emerald'
      ? 'text-emerald-700'
      : 'text-slate-900';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tabular-nums ${valCls}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{trend}</p>
    </div>
  );
};

export const AdminOverviewView: React.FC<{ onGoPending: () => void }> = ({ onGoPending }) => {
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    adminApi
      .getOverview()
      .then(res => {
        if (active) setData(res);
      })
      .catch(e => {
        if (active) setError(e?.message ?? 'Failed to load overview');
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        Unable to load overview: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-28 rounded-2xl bg-slate-200/70" />
        ))}
      </div>
    );
  }

  const signupTrend =
    data.prev_signups_30d > 0
      ? `${data.signups_30d >= data.prev_signups_30d ? '+' : ''}${data.signups_30d - data.prev_signups_30d} vs prev 30d`
      : `Today: ${data.signups_today} · 7d: ${data.signups_7d}`;

  const billTrend =
    data.prev_bills_month > 0
      ? `${data.bills_month >= data.prev_bills_month ? '+' : ''}${data.bills_month - data.prev_bills_month} vs last month`
      : `Today: ${data.bills_today} bills`;

  const funnelData = [
    { stage: 'Submitted', count: data.funnel.submitted },
    { stage: 'Approved', count: data.funnel.approved },
    { stage: 'First bill', count: data.funnel.first_bill }
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          label="Total shops (excl. test)"
          value={data.total_shops}
          trend={`Approved: ${data.approved_shops} · Suspended: ${data.suspended_shops}`}
        />
        <div
          onClick={onGoPending}
          className="cursor-pointer transition-transform hover:scale-[1.01]"
          title="Click to review pending shops"
        >
          <KpiCard
            label="Pending verification"
            value={data.pending_verification}
            trend={data.pending_verification > 0 ? 'Click to review queue' : 'All caught up'}
            tone={data.pending_verification > 0 ? 'amber' : 'emerald'}
          />
        </div>
        <KpiCard label="Sign-ups (30d)" value={data.signups_30d} trend={signupTrend} />
        <KpiCard
          label="Active shops (D / W / M)"
          value={`${data.active_daily} / ${data.active_weekly} / ${data.active_monthly}`}
          trend="Based on latest owner sign-in"
          tone="emerald"
        />
        <KpiCard label="Bills created (Month)" value={data.bills_month} trend={billTrend} />
        <KpiCard
          label="Inactive shops (30d+)"
          value={data.inactive_30d}
          trend="Approved shops with no login in 30 days"
          tone={data.inactive_30d > 0 ? 'rose' : 'neutral'}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Sign-ups over time (14 days)</h3>
            <p className="text-xs text-slate-500">
              {data.signups_7d} new sign-ups in the last 7 days; {data.signups_today} today.
            </p>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.signups_series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tickFormatter={d => String(d).slice(5)} fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip />
                <Line type="linear" dataKey="count" name="Sign-ups" stroke="#4338ca" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Bills created per day (14 days)</h3>
            <p className="text-xs text-slate-500">
              {data.bills_today} bills today · {data.bills_month} bills this month (counts only, no amounts).
            </p>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.bills_series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tickFormatter={d => String(d).slice(5)} fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip />
                <Bar dataKey="count" name="Bills" fill="#4338ca" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Verification funnel</h3>
          <p className="text-xs text-slate-500">
            Submitted: {data.funnel.submitted} → Approved: {data.funnel.approved} → Created first bill: {data.funnel.first_bill}
          </p>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnelData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" allowDecimals={false} fontSize={11} />
              <YAxis type="category" dataKey="stage" width={90} fontSize={12} />
              <Tooltip />
              <Bar dataKey="count" name="Shops" fill="#059669" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
