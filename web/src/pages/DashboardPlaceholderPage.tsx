import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/ui/Badge';
import {
  Store,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  BookOpen,
  ArrowRight,
  Clock,
  CheckCircle2
} from 'lucide-react';

export const DashboardPlaceholderPage: React.FC = () => {
  const { shop, user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Welcome Merchant Banner */}
        <div className="bg-gradient-to-r from-brand-950 via-brand-900 to-amber-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-brand-950/10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approved Enterprise Merchant
                </span>
                <span className="text-xs text-amber-200/80">
                  GST State: {shop?.state_code}
                </span>
              </div>
              <h1 className="font-serif-display text-2xl sm:text-3xl font-bold tracking-tight">
                {shop?.name || 'Silk Merchant Ledger'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
                Proprietor: <strong>{shop?.owner_name}</strong> • GSTIN: <span className="font-mono">{shop?.gstin}</span> • Default GST: <strong>{((shop?.default_gst_bp || 500) / 100).toFixed(0)}%</strong>
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-200 block">
                  Status
                </span>
                <span className="text-base font-bold text-white">Verified Shop</span>
                <span className="text-[11px] text-slate-300 block">All ledger features enabled</span>
              </div>
            </div>
          </div>
        </div>

        {/* Milestone 1 Verified Status Notice */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Phase 1 Complete: Authentication & Shop Verification System
              </h2>
              <p className="text-xs text-slate-500">
                You have passed the approval gate and your tenant database record is active.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
              <span className="text-xs font-semibold text-slate-500 block mb-1">Assigned Tenant ID</span>
              <span className="font-mono text-xs font-bold text-slate-800 break-all">{shop?.id}</span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
              <span className="text-xs font-semibold text-slate-500 block mb-1">Registered Address</span>
              <span className="text-xs text-slate-700">{shop?.address}</span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
              <span className="text-xs font-semibold text-slate-500 block mb-1">Primary Mobile & Email</span>
              <span className="text-xs font-medium text-slate-800">{shop?.phone} • {shop?.email}</span>
            </div>
          </div>
        </div>

        {/* Phase 2 Roadmap Preview Cards */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Upcoming Modules (Phase 2 & Phase 3)
            </h3>
            <span className="text-xs text-brand-900 font-semibold">Development Roadmap Ready</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:border-brand-300 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mb-3">
                <TrendingUp className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-slate-900 mb-1">Dashboard & Analytics</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Summary cards (Total Transactions, Pending Dues, Settled, Net Balance) with interactive charts.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:border-brand-300 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center mb-3">
                <Users className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-slate-900 mb-1">Parties Management</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Customer, Supplier, and Artisan directory with dual phone numbers, GSTIN verification, and ledger dots.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:border-brand-300 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3">
                <BookOpen className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-slate-900 mb-1">Ledger & GST Billing</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Circular swipe navigation (Party → Sales → Purchases) with automatic CGST+SGST/IGST tax splits and PDF bills.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

