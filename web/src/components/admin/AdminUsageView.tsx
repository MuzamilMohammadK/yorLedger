import React, { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, ShieldAlert } from 'lucide-react';
import { AdminDataQualityReport, AdminRole, AdminUsageSnapshot } from '@yorbalance/shared';
import { adminApi } from '../../lib/adminApi';

export const AdminUsageView: React.FC<{ adminRole: AdminRole | null }> = ({ adminRole }) => {
  const [usage, setUsage] = useState<AdminUsageSnapshot | null>(null);
  const [quality, setQuality] = useState<AdminDataQualityReport | null>(null);
  const [busyStats, setBusyStats] = useState(false);
  const [busyQuality, setBusyQuality] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRun = adminRole === 'super_admin' || adminRole === 'support';

  useEffect(() => {
    Promise.all([adminApi.getUsageStats(), adminApi.getDataQuality()])
      .then(([u, q]) => {
        setUsage(u);
        setQuality(q);
      })
      .catch(e => setError(e?.message ?? 'Failed to load usage & data quality'));
  }, []);

  const refreshStats = async () => {
    setBusyStats(true);
    setError(null);
    try {
      setUsage(await adminApi.refreshStats());
    } catch (e: any) {
      setError(e?.message ?? 'Failed to refresh stats');
    } finally {
      setBusyStats(false);
    }
  };

  const runQuality = async () => {
    setBusyQuality(true);
    setError(null);
    try {
      setQuality(await adminApi.runDataQuality());
    } catch (e: any) {
      setError(e?.message ?? 'Failed to run data quality check');
    } finally {
      setBusyQuality(false);
    }
  };

  const readsPct = usage ? Math.round((usage.reads_today / Math.max(1, usage.limits.daily_reads_limit)) * 100) : 0;
  const writesPct = usage ? Math.round((usage.writes_today / Math.max(1, usage.limits.daily_writes_limit)) * 100) : 0;
  const dbPct = usage ? Math.round((usage.estimated_db_mb / Math.max(1, usage.limits.db_limit_mb)) * 100) : 0;
  const warnThresh = usage?.limits.warning_threshold_pct ?? 80;
  const showQuotaWarning = usage && Math.max(readsPct, writesPct, dbPct) >= warnThresh;

  return (
    <div className="space-y-6">
      {error && <p className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">{error}</p>}

      {showQuotaWarning && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 flex items-center gap-3 text-sm text-amber-900">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <span>
            <strong>Quota warning ({warnThresh}%+):</strong> Usage has reached {Math.max(readsPct, writesPct, dbPct)}% of plan limits. Review limits in Settings or upgrade plan.
          </span>
        </div>
      )}

      {/* Usage Snapshot */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">Data &amp; usage</h2>
            <p className="text-xs text-slate-500">
              Snapshot date: {usage?.snapshot_date ?? 'Not generated yet'} (reads from `adminStats`, never scans collections from browser)
            </p>
          </div>
          {canRun && (
            <button
              type="button"
              disabled={busyStats}
              onClick={refreshStats}
              className="h-9 px-3.5 rounded-xl bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busyStats ? 'animate-spin' : ''}`} /> Refresh snapshot
            </button>
          )}
        </div>

        {!usage ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
            No `adminStats` snapshot yet. Click &ldquo;Refresh snapshot&rdquo; to generate today&apos;s usage snapshot.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-bold uppercase text-slate-500">Total documents</p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">{usage.total_documents}</p>
                <p className="mt-1 text-xs text-slate-500">Weekly growth: {usage.weekly_growth_pct}%</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-bold uppercase text-slate-500">Estimated DB size</p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">{usage.estimated_db_mb} MB</p>
                <p className="mt-1 text-xs text-slate-500">
                  Limit: {usage.limits.db_limit_mb} MB ({dbPct}%)
                </p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-bold uppercase text-slate-500">Reads / Writes today</p>
                <p className="mt-1 text-xl font-extrabold tabular-nums text-slate-900">
                  {usage.reads_today} / {usage.writes_today}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Limits: {usage.limits.daily_reads_limit} / {usage.limits.daily_writes_limit}
                </p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-bold uppercase text-slate-500">Storage &amp; Forecast</p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">{usage.storage_used_mb} MB</p>
                <p className="mt-1 text-xs text-slate-500">
                  {usage.forecast_days_to_limit !== null ? `Limit reached in ~${usage.forecast_days_to_limit} days` : 'Growth stable'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Collections Breakdown */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200">
                  <h3 className="text-sm font-bold text-slate-900">Documents per collection</h3>
                </div>
                <table className="w-full text-left border-collapse text-[13px]">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase font-bold text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Collection</th>
                      <th className="px-4 py-2 text-right">Documents</th>
                      <th className="px-4 py-2 text-right">Est. KB</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {usage.collections.map(c => (
                      <tr key={c.name}>
                        <td className="px-4 py-2 font-mono text-xs text-slate-800">{c.name}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold">{c.count}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-500">{c.estimated_kb} KB</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Top 10 Shops */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200">
                  <h3 className="text-sm font-bold text-slate-900">Top 10 shops by data volume</h3>
                </div>
                <table className="w-full text-left border-collapse text-[13px]">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase font-bold text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Shop</th>
                      <th className="px-4 py-2 text-right">Bills</th>
                      <th className="px-4 py-2 text-right">Parties</th>
                      <th className="px-4 py-2 text-right">Total docs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {usage.top_shops.map(s => (
                      <tr key={s.shop_id}>
                        <td className="px-4 py-2 font-semibold text-slate-900">{s.shop_name}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{s.bills_count}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{s.parties_count}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-bold text-indigo-700">{s.total_docs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Data Quality Section */}
      <section className="space-y-4 pt-2 border-t border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">Data quality</h2>
            <p className="text-xs text-slate-500">
              Last checked: {quality?.checked_at ? new Date(quality.checked_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Not run yet'}
            </p>
          </div>
          {canRun && (
            <button
              type="button"
              disabled={busyQuality}
              onClick={runQuality}
              className="h-9 px-3.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-bold inline-flex items-center gap-1.5"
            >
              <ShieldAlert className="w-3.5 h-3.5" /> {busyQuality ? 'Checking...' : 'Run quality scan'}
            </button>
          )}
        </div>

        {!quality ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
            No data quality report yet. Click &ldquo;Run quality scan&rdquo; to inspect duplicate items/parties, negative stock, and bill/tally checks.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Duplicate items', val: quality.duplicate_items_count },
                { label: 'Duplicate parties', val: quality.duplicate_parties_count },
                { label: 'Negative stock', val: quality.negative_stock_count },
                { label: 'Mismatched bills', val: quality.mismatched_bills_count },
                { label: 'Tally mismatches', val: quality.tally_mismatch_count }
              ].map(k => (
                <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-3.5">
                  <p className="text-[11px] font-bold uppercase text-slate-500">{k.label}</p>
                  <p className={`mt-1 text-xl font-extrabold tabular-nums ${k.val > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {k.val}
                  </p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-900">Drill-down issues ({quality.issues.length})</h3>
              </div>
              {quality.issues.length === 0 ? (
                <p className="p-8 text-center text-xs text-slate-500">No data quality issues detected.</p>
              ) : (
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 text-xs">
                  {quality.issues.map((iss, i) => (
                    <div key={i} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold text-rose-700 mr-2">{iss.kind}</span>
                        <span className="font-semibold text-slate-900">{iss.shop_name}</span>
                      </div>
                      <span className="text-slate-600">{iss.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
};
