import React from 'react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { Settings, Store, ShieldCheck, Mail, Phone, MapPin, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export const SettingsPage: React.FC = () => {
  const { shop, user } = useAuth();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-600">
                Configuration
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                Shop Settings
              </span>
            </div>
            <h1 className="font-serif-display text-2xl font-bold text-slate-900 mt-1">
              Shop Profile & Tax Preferences
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Review your registered business profile, GST credentials, and verified documents.
            </p>
          </div>

          <Link
            to="/dashboard"
            className="px-4 py-2 rounded-xl text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors self-start sm:self-auto"
          >
            ← Return to Dashboard
          </Link>
        </div>

        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6 max-w-3xl">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-serif-display text-lg font-bold text-slate-900">{shop?.name}</h3>
              <p className="text-xs text-slate-500">Proprietor: {shop?.owner_name}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">GSTIN Identifier</span>
              <strong className="text-slate-900 font-mono text-sm block mt-0.5">{shop?.gstin}</strong>
              <span className="text-slate-500 text-[11px]">State Code: {shop?.state_code}</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">Default GST Rate</span>
              <strong className="text-slate-900 font-serif-display text-sm block mt-0.5">
                {((shop?.default_gst_bp || 500) / 100).toFixed(0)}% Basis Points ({shop?.default_gst_bp || 500} bp)
              </strong>
              <span className="text-slate-500 text-[11px]">Applied to new saree and fabric line items</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">Contact Information</span>
              <strong className="text-slate-900 block mt-0.5">{shop?.phone}</strong>
              <span className="text-slate-500 text-[11px]">{shop?.email}</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">Verification Status</span>
              <strong className="text-emerald-600 flex items-center gap-1 mt-0.5">
                <ShieldCheck className="w-4 h-4" /> Officially Approved
              </strong>
              <span className="text-slate-500 text-[11px]">Verified by: {shop?.verified_by || 'Admin'}</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 sm:col-span-2">
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">Registered Shop Address</span>
              <p className="text-slate-800 text-xs font-medium mt-0.5">{shop?.address}</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};
