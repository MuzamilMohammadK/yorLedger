import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShoppingBag, TrendingUp, Scissors, BarChart3, ChevronRight } from 'lucide-react';
import { ReportFilterOptions, financialYearOptions, resolveReportPeriod, toCsv } from '@yorbalance/shared';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useLive } from '../lib/useLiveData';
import { todayIST } from '../lib/data/util';
import { shareFile } from '../lib/platform';
import { ReportFilterBar } from '../components/reports/ReportFilterBar';
import { PurchaseLedgerTable } from '../components/reports/PurchaseLedgerTable';
import { SalesLedgerTable } from '../components/reports/SalesLedgerTable';
import { JobWorkLedgerTable } from '../components/reports/JobWorkLedgerTable';
import { GSTDashboardView } from '../components/reports/GSTDashboardView';

type Tab = 'overview' | 'purchase' | 'sales' | 'job' | 'gst';
const FILTER_KEY = 'yorledger_report_filters';

/** §11 Reports & GST analytics: four report sheets, common filters, CSV export and print. */
export const AnalyticsPage: React.FC = () => {
  const { t } = useI18n();
  const { shop } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('r') as Tab) || 'overview';
  const setTab = (r: Tab) => setParams(r === 'overview' ? {} : { r });
  const [filters, setFiltersState] = React.useState<ReportFilterOptions>(() => {
    try { const s = localStorage.getItem(FILTER_KEY); if (s) return JSON.parse(s); } catch { /* optional */ }
    return { financialYear: financialYearOptions(todayIST())[0].value };
  });
  const setFilters = (f: ReportFilterOptions) => { setFiltersState(f); try { localStorage.setItem(FILTER_KEY, JSON.stringify(f)); } catch { /* optional */ } };
  const period = resolveReportPeriod(filters, todayIST());
  const key = JSON.stringify(filters);

  const { data: purchase } = useLive(() => api.getPurchaseLedger(filters), [key]);
  const { data: sales } = useLive(() => api.getSalesLedger(filters), [key]);
  const { data: job } = useLive(() => api.getJobWorkLedger(filters), [key]);
  const { data: gst } = useLive(() => api.getGSTDashboard(filters), [key]);

  const tabs: { id: Tab; label: string; icon: typeof ShoppingBag; desc: string; count?: string }[] = useMemo(() => [
    { id: 'purchase', label: t('rep_purchase'), icon: ShoppingBag, desc: t('rep_purchase_desc'), count: purchase ? t('bills_n', { n: purchase.report.items.length }) : '' },
    { id: 'sales', label: t('rep_sales'), icon: TrendingUp, desc: t('rep_sales_desc'), count: sales ? t('bills_n', { n: sales.report.items.length }) : '' },
    { id: 'job', label: t('rep_job'), icon: Scissors, desc: t('rep_job_desc'), count: job ? t('artisans_n', { n: job.report.artisan_summaries.length }) : '' },
    { id: 'gst', label: t('rep_gst'), icon: BarChart3, desc: t('rep_gst_desc') }
  ], [t, purchase, sales, job]);

  // CSV of exactly what this report shows (same numbers, same period), with shop identity.
  const exportCsv = async () => {
    const meta = { shop: shop?.name ?? '', gstin: shop?.gstin ?? '', period: `${period.label} (${period.from} to ${period.to})`, report: '' };
    let csv = '';
    let name = 'report';
    if (tab === 'purchase' && purchase) {
      const r = purchase.report;
      name = 'purchase-ledger';
      csv = toCsv({ ...meta, report: 'Purchase ledger' }, [
        { key: 'supplier_name', label: 'Supplier' }, { key: 'supplier_gstin', label: 'Supplier GSTIN' }, { key: 'invoice_number', label: 'Bill no.' },
        { key: 'bill_date', label: 'Bill date' }, { key: 'taxable_value', label: 'Taxable value' }, { key: 'cgst', label: 'CGST' }, { key: 'sgst', label: 'SGST' },
        { key: 'igst', label: 'IGST' }, { key: 'total_gst', label: 'Total GST' }, { key: 'returns', label: 'Returns' },
        { key: 'net_purchase_amount', label: 'Net purchase amount' }, { key: 'eligible_itc', label: 'Eligible ITC' }, { key: 'payment_status', label: 'Payment status' }
      ], r.items as any, {
        taxable_value: r.totals.total_taxable_value, cgst: r.totals.total_cgst, sgst: r.totals.total_sgst, igst: r.totals.total_igst,
        total_gst: r.totals.total_gst, returns: r.totals.total_returns, net_purchase_amount: r.totals.total_purchase_value, eligible_itc: r.totals.eligible_itc
      });
    } else if (tab === 'sales' && sales) {
      const r = sales.report;
      name = 'sales-ledger';
      csv = toCsv({ ...meta, report: 'Sales ledger' }, [
        { key: 'customer_name', label: 'Customer' }, { key: 'customer_gstin', label: 'Customer GSTIN' }, { key: 'invoice_number', label: 'Bill no.' },
        { key: 'bill_date', label: 'Bill date' }, { key: 'sales_type', label: 'Same / other state' }, { key: 'taxable_value', label: 'Taxable value' },
        { key: 'cgst', label: 'CGST' }, { key: 'sgst', label: 'SGST' }, { key: 'igst', label: 'IGST' }, { key: 'total_gst', label: 'Total GST' },
        { key: 'grand_total', label: 'Bill total (after returns)' }, { key: 'amount_paid', label: 'Paid' }, { key: 'remaining_due', label: 'Remaining due' },
        { key: 'payment_status', label: 'Payment status' }
      ], r.items as any, {
        taxable_value: r.totals.total_taxable_sales, cgst: r.totals.total_cgst, sgst: r.totals.total_sgst, igst: r.totals.total_igst,
        total_gst: r.totals.total_output_gst, grand_total: r.totals.total_sales_value, amount_paid: r.totals.total_paid, remaining_due: r.totals.total_outstanding_due
      });
    } else if (tab === 'job' && job) {
      const r = job.report;
      name = 'job-work';
      csv = toCsv({ ...meta, report: 'Artisan & job work' }, [
        { key: 'artisan_name', label: 'Artisan' }, { key: 'job_work_reference', label: 'Bill no.' }, { key: 'transaction_date', label: 'Date' },
        { key: 'work_details', label: 'Work' }, { key: 'quantity', label: 'Quantity' }, { key: 'job_work_amount', label: 'Job-work amount' },
        { key: 'gst', label: 'GST' }, { key: 'total_amount', label: 'Total' }, { key: 'amount_paid', label: 'Paid' },
        { key: 'outstanding_amount', label: 'Outstanding' }, { key: 'payment_status', label: 'Payment status' }
      ], r.items as any, {
        job_work_amount: r.totals.total_job_work_value, gst: r.totals.total_gst, amount_paid: r.totals.total_payments, outstanding_amount: r.totals.total_outstanding
      });
    } else if (gst) {
      const g = gst.gst_data;
      name = 'gst-dashboard';
      const rows = [
        { a: 'Total taxable sales', b: g.summary.total_taxable_sales }, { a: 'Output tax', b: g.summary.output_gst },
        { a: 'Eligible input tax credit', b: g.summary.eligible_itc }, { a: 'Net GST payable', b: g.summary.net_gst_payable },
        { a: 'Output CGST', b: g.tax_breakdown.output_cgst }, { a: 'Output SGST', b: g.tax_breakdown.output_sgst }, { a: 'Output IGST', b: g.tax_breakdown.output_igst },
        { a: 'Input CGST', b: g.tax_breakdown.input_cgst }, { a: 'Input SGST', b: g.tax_breakdown.input_sgst }, { a: 'Input IGST', b: g.tax_breakdown.input_igst },
        ...g.charts.monthly_net_payable_trend.map(m => ({ a: `Net payable ${m.month}`, b: m.net_payable }))
      ];
      csv = toCsv({ ...meta, report: 'GST dashboard' }, [{ key: 'a', label: 'Item' }, { key: 'b', label: 'Amount' }], rows) + `\r\n\r\n"${gst.disclaimer.replace(/"/g, '""')}"`;
    }
    if (csv) await shareFile(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `yorledger-${name}-${period.from}-to-${period.to}.csv`, name);
  };

  return (
    <div className="space-y-5">
      {/* Print header: shop identity + period on paper (§11.8) */}
      <div className="hidden print:block">
        <p className="text-xl font-bold">{shop?.name} · GSTIN {shop?.gstin}</p>
        <p>{tabs.find(x => x.id === tab)?.label ?? t('rep_overview')} · {period.label} ({period.from} – {period.to})</p>
      </div>

      <div className="print:hidden">
        <h1 className="text-2xl font-bold text-slate-900">{t('nav_reports')}</h1>
        <p className="text-base text-slate-600">{t('reports_sub')}</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 print:hidden">
        {[{ id: 'overview' as Tab, label: t('rep_overview') }, ...tabs].map(x => (
          <button key={x.id} onClick={() => setTab(x.id)}
            className={`h-11 px-4 shrink-0 rounded-full text-base font-semibold ${tab === x.id ? 'bg-indigo-700 text-white' : 'bg-white border-2 border-slate-200 text-slate-700'}`}>
            {x.label}
          </button>
        ))}
      </div>

      <ReportFilterBar filters={filters} onChange={setFilters} onExportCsv={tab === 'overview' ? undefined : exportCsv}
        onPrint={() => window.print()} showPartySearch={tab !== 'gst' && tab !== 'overview'} periodLabel={`${period.label} · ${period.from} → ${period.to}`} />
      <p className="hidden md:block text-sm text-slate-500 print:hidden">{t('report_period')}: {period.label} ({period.from} → {period.to})</p>

      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {tabs.map(x => (
              <button key={x.id} onClick={() => setTab(x.id)} className="text-left rounded-2xl bg-white border border-slate-200 p-4 hover:border-indigo-300">
                <div className="flex items-center gap-3">
                  <span className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center"><x.icon className="w-6 h-6" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-bold text-slate-900">{x.label}</p>
                    <p className="text-sm text-slate-600">{x.desc}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </div>
                {x.count && <p className="mt-2 text-sm font-semibold text-slate-500">{x.count}</p>}
              </button>
            ))}
          </div>
          {gst && <GSTDashboardView data={gst.gst_data as any} disclaimer={gst.disclaimer} loading={false} />}
        </div>
      )}
      {tab === 'purchase' && <PurchaseLedgerTable report={(purchase?.report ?? null) as any} loading={!purchase} />}
      {tab === 'sales' && <SalesLedgerTable report={(sales?.report ?? null) as any} loading={!sales} />}
      {tab === 'job' && <JobWorkLedgerTable report={(job?.report ?? null) as any} loading={!job} />}
      {tab === 'gst' && gst && <GSTDashboardView data={gst.gst_data as any} disclaimer={gst.disclaimer} loading={false} />}
    </div>
  );
};
