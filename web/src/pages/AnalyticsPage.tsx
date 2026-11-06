import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { ReportFilterBar } from '../components/reports/ReportFilterBar';
import { PurchaseLedgerTable } from '../components/reports/PurchaseLedgerTable';
import { SalesLedgerTable } from '../components/reports/SalesLedgerTable';
import { JobWorkLedgerTable } from '../components/reports/JobWorkLedgerTable';
import { GSTDashboardView } from '../components/reports/GSTDashboardView';
import { api } from '../lib/api';
import {
  ReportFilterOptions,
  PurchaseLedgerReport,
  SalesLedgerReport,
  ArtisanJobWorkReport,
  GSTDashboardData
} from '@yorbalance/shared';
import {
  ShoppingBag,
  TrendingUp,
  Scissors,
  Receipt,
  ArrowRight,
  ChevronLeft,
  FileSpreadsheet,
  Download,
  Printer,
  Sparkles,
  BarChart3
} from 'lucide-react';

type ReportTab = 'OVERVIEW' | 'PURCHASE' | 'SALES' | 'JOB_WORK' | 'GST';

export const AnalyticsPage: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const defaultFY = `FY ${currentYear}-${((currentYear + 1) % 100).toString().padStart(2, '0')}`;

  const [activeTab, setActiveTab] = useState<ReportTab>('OVERVIEW');
  const [filters, setFilters] = useState<ReportFilterOptions>({
    financialYear: defaultFY
  });

  const [loading, setLoading] = useState(false);
  const [purchaseReport, setPurchaseReport] = useState<PurchaseLedgerReport | null>(null);
  const [salesReport, setSalesReport] = useState<SalesLedgerReport | null>(null);
  const [jobWorkReport, setJobWorkReport] = useState<ArtisanJobWorkReport | null>(null);
  const [gstDashboard, setGstDashboard] = useState<GSTDashboardData | null>(null);
  const [disclaimer, setDisclaimer] = useState<string>('');

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'OVERVIEW' || activeTab === 'PURCHASE') {
        const res = await api.getPurchaseLedger(filters);
        setPurchaseReport(res.report);
      }
      if (activeTab === 'OVERVIEW' || activeTab === 'SALES') {
        const res = await api.getSalesLedger(filters);
        setSalesReport(res.report);
      }
      if (activeTab === 'OVERVIEW' || activeTab === 'JOB_WORK') {
        const res = await api.getJobWorkLedger(filters);
        setJobWorkReport(res.report);
      }
      if (activeTab === 'OVERVIEW' || activeTab === 'GST') {
        const res = await api.getGSTDashboard(filters);
        setGstDashboard(res.gst_data);
        setDisclaimer(res.disclaimer);
      }
    } catch (err) {
      console.error('Failed to load reports data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab, filters.financialYear, filters.quarter, filters.month, filters.from, filters.to, filters.partySearch]);

  const handleExportCsv = async () => {
    try {
      const type = activeTab === 'OVERVIEW' || activeTab === 'GST' ? 'reports' : 'transactions';
      const csv = await api.exportShopData(type as any);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yorledger_${activeTab.toLowerCase()}_report_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export CSV', e);
      alert('Unable to generate CSV export');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-600">
                Official Registers & Tax Filing
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700">
                Reports & GST Analytics
              </span>
            </div>
            <h1 className="font-serif-display text-2xl font-bold text-slate-900 mt-1">
              Business Reports & GST Analytics
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Input tax credit reconciliation, sales output liability, artisan job-work accounts and statutory compliance.
            </p>
          </div>

          {activeTab !== 'OVERVIEW' && (
            <button
              onClick={() => setActiveTab('OVERVIEW')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-xs transition-colors self-start sm:self-auto"
            >
              <ChevronLeft className="w-4 h-4 text-slate-500" />
              <span>Back to Report Cards</span>
            </button>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none print:hidden">
          <button
            onClick={() => setActiveTab('OVERVIEW')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
              activeTab === 'OVERVIEW'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All Reports Overview
          </button>
          <button
            onClick={() => setActiveTab('PURCHASE')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
              activeTab === 'PURCHASE'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Purchase Ledger & ITC</span>
          </button>
          <button
            onClick={() => setActiveTab('SALES')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
              activeTab === 'SALES'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Sales Ledger & GSTR-1</span>
          </button>
          <button
            onClick={() => setActiveTab('JOB_WORK')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
              activeTab === 'JOB_WORK'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Artisan & Job Work</span>
          </button>
          <button
            onClick={() => setActiveTab('GST')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
              activeTab === 'GST'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>GST Dashboard & 3B</span>
          </button>
        </div>

        {/* Global Common Filter Bar */}
        <ReportFilterBar
          filters={filters}
          onChange={setFilters}
          onExportCsv={handleExportCsv}
          onPrint={handlePrint}
          loading={loading}
          showPartySearch={activeTab !== 'GST'}
        />

        {/* TAB 1: 4 Report Cards Overview Landing Page */}
        {activeTab === 'OVERVIEW' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Card 1: Purchase Ledger */}
              <div
                onClick={() => setActiveTab('PURCHASE')}
                className="bg-white rounded-3xl p-6 border border-slate-200 hover:border-purple-300 shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <ShoppingBag className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                      Input Tax Credit
                    </span>
                  </div>
                  <h3 className="font-serif-display text-lg font-bold text-slate-900 group-hover:text-purple-700 transition-colors">
                    1. Purchase Ledger
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Supplier-wise bill records, GSTIN verification, returns reconciliation, and calculation of statutory eligible Input Tax Credit (ITC).
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">
                    {purchaseReport?.items.length || 0} Bills Recorded
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 group-hover:translate-x-0.5 transition-transform">
                    Open Register <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>

              {/* Card 2: Sales Ledger */}
              <div
                onClick={() => setActiveTab('SALES')}
                className="bg-white rounded-3xl p-6 border border-slate-200 hover:border-purple-300 shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <TrendingUp className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
                      Output Liability
                    </span>
                  </div>
                  <h3 className="font-serif-display text-lg font-bold text-slate-900 group-hover:text-purple-700 transition-colors">
                    2. Sales Ledger
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Customer billings, separation of retail intra-state sales from out-of-state inter-state (IGST) shipments, collections, and dues.
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">
                    {salesReport?.items.length || 0} Invoices Recorded
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 group-hover:translate-x-0.5 transition-transform">
                    Open Register <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>

              {/* Card 3: Artisan & Job Work */}
              <div
                onClick={() => setActiveTab('JOB_WORK')}
                className="bg-white rounded-3xl p-6 border border-slate-200 hover:border-purple-300 shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Scissors className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                      Production & Labor
                    </span>
                  </div>
                  <h3 className="font-serif-display text-lg font-bold text-slate-900 group-hover:text-purple-700 transition-colors">
                    3. Artisan and Job Work
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Weaver, dyer, and embroidery job work tracking, material quantities, labor disbursements, and outstanding wages dues.
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">
                    {jobWorkReport?.artisan_summaries.length || 0} Artisans
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 group-hover:translate-x-0.5 transition-transform">
                    Open Register <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>

              {/* Card 4: GST Dashboard */}
              <div
                onClick={() => setActiveTab('GST')}
                className="bg-white rounded-3xl p-6 border border-slate-200 hover:border-purple-300 shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <BarChart3 className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                      GSTR-3B Analytics
                    </span>
                  </div>
                  <h3 className="font-serif-display text-lg font-bold text-slate-900 group-hover:text-purple-700 transition-colors">
                    4. GST Dashboard
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Net cash challan payable, CGST/SGST/IGST breakdown matrix, monthly turnover trends, and interactive analytical charts.
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">
                    Analytical Tax Modeling
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 group-hover:translate-x-0.5 transition-transform">
                    Open Dashboard <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Glance at GST Dashboard on Overview Page */}
            <div className="pt-4">
              <GSTDashboardView data={gstDashboard} disclaimer={disclaimer} loading={loading} />
            </div>
          </div>
        )}

        {/* TAB 2: Purchase Ledger */}
        {activeTab === 'PURCHASE' && (
          <PurchaseLedgerTable report={purchaseReport} loading={loading} />
        )}

        {/* TAB 3: Sales Ledger */}
        {activeTab === 'SALES' && (
          <SalesLedgerTable report={salesReport} loading={loading} />
        )}

        {/* TAB 4: Artisan & Job Work */}
        {activeTab === 'JOB_WORK' && (
          <JobWorkLedgerTable report={jobWorkReport} loading={loading} />
        )}

        {/* TAB 5: GST Dashboard */}
        {activeTab === 'GST' && (
          <GSTDashboardView data={gstDashboard} disclaimer={disclaimer} loading={loading} />
        )}
      </div>
    </DashboardLayout>
  );
};
