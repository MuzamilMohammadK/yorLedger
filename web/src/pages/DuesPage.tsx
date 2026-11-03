import React from 'react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { Clock, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export const DuesPage: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-600">
                Phase 6 Module
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700">
                Dues & Payments Manager
              </span>
            </div>
            <h1 className="font-serif-display text-2xl font-bold text-slate-900 mt-1">
              Outstanding Balances, Cheque & NEFT Tracking
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Cash collection vouchers, cheque clearance tracking, UTR verification, and automated due reminders.
            </p>
          </div>

          <Link
            to="/dashboard"
            className="px-4 py-2 rounded-xl text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors self-start sm:self-auto"
          >
            ← Return to Dashboard
          </Link>
        </div>

        <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center max-w-xl mx-auto space-y-4 shadow-sm my-8">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <Clock className="w-7 h-7" />
          </div>
          <h3 className="font-serif-display text-lg font-bold text-slate-900">
            Dues & Clearances Tracking
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Your live pending and settled dues are summarized in real time on the Dashboard summary cards and the Dues vs Clearances chart.
          </p>
          <div className="pt-2">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold text-xs hover:bg-purple-700 transition-colors"
            >
              Back to Overview Dashboard <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};
