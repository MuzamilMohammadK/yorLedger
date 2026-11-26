import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { AdminHealthSnapshot, ServiceStatusLevel } from '@yorbalance/shared';
import { adminApi } from '../../lib/adminApi';

const statusUi = (s: ServiceStatusLevel) => {
  if (s === 'DOWN') {
    return {
      label: 'Down',
      icon: XCircle,
      badge: 'bg-rose-50 text-rose-700 border-rose-200',
      iconCls: 'text-rose-600'
    };
  }
  if (s === 'DEGRADED') {
    return {
      label: 'Degraded',
      icon: AlertTriangle,
      badge: 'bg-amber-50 text-amber-800 border-amber-200',
      iconCls: 'text-amber-600'
    };
  }
  return {
    label: 'OK',
    icon: CheckCircle2,
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    iconCls: 'text-emerald-600'
  };
};

export const AdminHealthView: React.FC = () => {
  const [health, setHealth] = useState<AdminHealthSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const h = await adminApi.getHealth();
      setHealth(h);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load health status');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const runNow = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await adminApi.runHealthCheck();
      setHealth(res);
    } catch (e: any) {
      setError(e?.message ?? 'Health check failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs text-slate-500">
            Last checked: {health?.last_checked ? new Date(health.last_checked).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Not run yet'}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={runNow}
          className="h-10 px-4 rounded-xl bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /> Run health check
        </button>
      </div>

      {error && <p className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">{error}</p>}

      {!health ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-sm text-slate-500">
          No health check snapshot yet. Click &ldquo;Run health check&rdquo; above to populate service status.
        </div>
      ) : (
        <>
          {/* 6 Service Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {health.services.map(svc => {
              const ui = statusUi(svc.status);
              const Icon = ui.icon;
              return (
                <div key={svc.key} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-500">{svc.label}</p>
                    <p className="mt-1 text-lg font-extrabold text-slate-900 flex items-center gap-1.5">
                      <Icon className={`w-5 h-5 ${ui.iconCls}`} />
                      <span>{ui.label}</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {svc.latency_ms !== null && svc.latency_ms !== undefined ? `${svc.latency_ms} ms` : svc.message ?? 'Checked'}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${ui.badge}`}>{ui.label}</span>
                </div>
              );
            })}
          </div>

          {/* Error Rate & Failed Logins */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-bold uppercase text-slate-500">Error count (24h)</p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">{health.error_rate_24h}</p>
              <p className="mt-1 text-xs text-slate-500">Logged across systemErrors</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-bold uppercase text-slate-500">Failed logins (24h)</p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">{health.failed_logins_24h}</p>
              <p className="mt-1 text-xs text-slate-500">Last 24 hours</p>
            </div>
          </div>

          {/* 24h Latency History + 7d Uptime */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
              <h3 className="text-sm font-bold text-slate-900">24-hour response latency</h3>
              <p className="text-xs text-slate-500">Average service check latency across recent probes.</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={health.history_24h}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="timestamp" tickFormatter={t => String(t).slice(11, 16)} fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Line type="linear" dataKey="latency_ms" name="Latency (ms)" stroke="#4338ca" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
              <h3 className="text-sm font-bold text-slate-900">7-day uptime history</h3>
              <p className="text-xs text-slate-500">Daily availability percentage and incident count.</p>
              <div className="divide-y divide-slate-100 text-xs">
                {health.history_7d.length === 0 ? (
                  <p className="py-6 text-center text-slate-400">History builds automatically over 7 days.</p>
                ) : (
                  health.history_7d.map(d => (
                    <div key={d.date} className="py-2 flex items-center justify-between">
                      <span className="font-mono text-slate-700">{d.date}</span>
                      <span className="font-bold text-emerald-700">{d.uptime_pct}% uptime</span>
                      <span className="text-slate-500">{d.incidents} incidents</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Recent Errors */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">Recent errors</h3>
            </div>
            {health.recent_errors.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-500">No recent errors logged.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[13px]">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase font-bold text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Message</th>
                      <th className="px-4 py-2.5 text-right">Count</th>
                      <th className="px-4 py-2.5">First seen</th>
                      <th className="px-4 py-2.5">Last seen</th>
                      <th className="px-4 py-2.5 text-right">Shops affected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {health.recent_errors.map(e => (
                      <tr key={e.id}>
                        <td className="px-4 py-2.5 font-mono text-xs text-rose-700">{e.message}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-bold">{e.count}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{e.first_seen.slice(0, 16).replace('T', ' ')}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{e.last_seen.slice(0, 16).replace('T', ' ')}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{e.shops_affected}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
