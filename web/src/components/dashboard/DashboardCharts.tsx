import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, PieChart, Pie, Cell
} from 'recharts';
import { DashboardSeries, formatPaiseToINR } from '@yorbalance/shared';
import { useI18n } from '../../i18n';

const C = { sales: '#059669', purchases: '#0284c7', job: '#d97706', pending: '#f59e0b', settled: '#10b981', pay: '#4f46e5', ret: '#64748b' };
const rupeeAxis = (v: number) => (v >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v));
const rs = (paise: number) => formatPaiseToINR(paise, true);

const Card: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <section className={`rounded-2xl bg-white border border-slate-200 p-4 ${className}`}>
    <h3 className="text-lg font-bold text-slate-900 mb-3">{title}</h3>
    <div className="h-64">{children}</div>
  </section>
);

/** §6.4: Sales vs Purchases bar, Sales trend line, Pending vs Settled donut, Transactions by type. */
export const DashboardCharts: React.FC<{ series: DashboardSeries }> = ({ series }) => {
  const { t } = useI18n();
  const rupees = series.buckets.map(b => ({ ...b, salesR: b.sales / 100, purchasesR: b.purchases / 100, jobR: b.job_work / 100 }));
  const donut = [
    { name: t('pending_word'), value: series.pending_vs_settled.pending, amount: series.pending_vs_settled.pending_amount, color: C.pending },
    { name: t('settled_word'), value: series.pending_vs_settled.settled, amount: series.pending_vs_settled.settled_amount, color: C.settled }
  ];
  const types = [
    { name: t('kind_SALE'), value: series.by_type.sale, color: C.sales },
    { name: t('kind_PURCHASE'), value: series.by_type.purchase, color: C.purchases },
    { name: t('kind_JOB_WORK'), value: series.by_type.job_work, color: C.job },
    { name: t('kind_PAYMENT'), value: series.by_type.payment, color: C.pay },
    { name: t('kind_RETURN'), value: series.by_type.return, color: C.ret }
  ];
  const moneyTip = (v: number) => rs(Math.round(v * 100));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={t('chart_svp')}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rupees} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
            <YAxis tickFormatter={rupeeAxis} tick={{ fontSize: 12 }} width={44} />
            <Tooltip formatter={(v: any) => moneyTip(Number(v))} />
            <Legend />
            <Bar isAnimationActive={false} dataKey="salesR" name={t('sales')} fill={C.sales} radius={[4, 4, 0, 0]} />
            <Bar isAnimationActive={false} dataKey="purchasesR" name={t('purchases')} fill={C.purchases} radius={[4, 4, 0, 0]} />
            <Bar isAnimationActive={false} dataKey="jobR" name={t('job_work')} fill={C.job} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title={t('chart_trend')}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rupees} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
            <YAxis tickFormatter={rupeeAxis} tick={{ fontSize: 12 }} width={44} />
            <Tooltip formatter={(v: any) => moneyTip(Number(v))} />
            <Line isAnimationActive={false} type="monotone" dataKey="salesR" name={t('sales')} stroke={C.sales} strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card title={t('chart_pvs')}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie isAnimationActive={false} data={donut} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
              {donut.map(d => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip formatter={(v: any, _n: any, p: any) => `${v} · ${rs(p.payload.amount)}`} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      <Card title={t('chart_tx')}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={types} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 13 }} width={88} />
            <Tooltip />
            <Bar isAnimationActive={false} dataKey="value" radius={[0, 4, 4, 0]}>
              {types.map(d => <Cell key={d.name} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
};
