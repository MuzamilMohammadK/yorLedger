import React from 'react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { Users, Plus, Search, Store, Phone, MapPin, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export const PartiesPage: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-600">
                Phase 3 Module
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700">
                Parties Management
              </span>
            </div>
            <h1 className="font-serif-display text-2xl font-bold text-slate-900 mt-1">
              Customers, Silk Suppliers & Handloom Artisans
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Maintain full party ledgers, contact directories, and pending balance ledgers.
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
            <Users className="w-7 h-7" />
          </div>
          <h3 className="font-serif-display text-lg font-bold text-slate-900">
            Parties Directory Ready for Phase 3
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            The database schema and relational party keys have been provisioned in Migration 002. You can view parties and their individual transaction breakdowns on your main Dashboard.
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
