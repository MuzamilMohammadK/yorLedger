import React from 'react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { BarChart3, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export const AnalyticsPage: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-600">
                Phase 7 Module
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700">
                Reports & GST Analytics
              </span>
            </div>
            <h1 className="font-serif-display text-2xl font-bold text-slate-900 mt-1">
              Sales, Purchases, Job Work & Tax Registers
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              GSTR-1, GSTR-3B monthly breakdowns, artisan production yield, and year-over-year growth analytics.
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
          <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto">
            <BarChart3 className="w-7 h-7" />
          </div>
          <h3 className="font-serif-display text-lg font-bold text-slate-900">
            Interactive Analytical Visualizations Active
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Your live sales vs purchases comparison, daily velocity trend, and dues recovery ratio are interactive on your main Dashboard.
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
