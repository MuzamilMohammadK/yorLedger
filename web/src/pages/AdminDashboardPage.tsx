import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Shop } from '@yorbalance/shared';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import {
  ShieldCheck,
  Check,
  X,
  Search,
  RefreshCw,
  Store,
  User,
  Phone,
  Mail,
  MapPin,
  FileText,
  Calendar,
  AlertCircle,
  Image as ImageIcon,
  ExternalLink,
  Eye,
  CheckCircle2
} from 'lucide-react';

export const AdminDashboardPage: React.FC = () => {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectingShop, setRejectingShop] = useState<Shop | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [viewingDocShop, setViewingDocShop] = useState<Shop | null>(null);

  const fetchShops = async () => {
    try {
      setLoading(true);
      const filter = statusFilter === 'ALL' ? undefined : statusFilter;
      const res = await api.getAdminShops(filter);
      setShops(res?.shops || []);
    } catch (err: any) {
      console.error('Failed to load admin shops:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShops();
  }, [statusFilter]);

  const handleApprove = async (shop: Shop) => {
    if (!window.confirm(`Confirm approval for "${shop.name}" (GSTIN: ${shop.gstin})? This will grant full dashboard and ledger access.`)) {
      return;
    }

    try {
      setActionLoading(shop.id);
      await api.recordAdminDecision(shop.id, { decision: 'APPROVED' });
      setActionSuccess(`Shop "${shop.name}" approved successfully! Owner access is now active.`);
      await fetchShops();
    } catch (err: any) {
      alert(err.message || 'Approval action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingShop) return;

    if (!rejectReason.trim()) {
      setRejectError('Please state the specific reason for rejecting this shop registration.');
      return;
    }

    try {
      setActionLoading(rejectingShop.id);
      await api.recordAdminDecision(rejectingShop.id, {
        decision: 'REJECTED',
        reason: rejectReason.trim()
      });
      setActionSuccess(`Shop "${rejectingShop.name}" has been rejected. Owner notified to correct details.`);
      setRejectingShop(null);
      setRejectReason('');
      setRejectError(null);
      await fetchShops();
    } catch (err: any) {
      setRejectError(err.message || 'Rejection action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredShops = shops.filter(s => {
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.owner_name.toLowerCase().includes(q) ||
      s.gstin.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Top Header */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center text-purple-700">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Merchant Verification & Approval Console</h1>
              <p className="text-xs text-slate-500">
                Review submitted business details, verify uploaded JPEG documents, and manage approval status
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchShops}
              isLoading={loading}
              className="gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh Queue
            </Button>
          </div>
        </div>

        {actionSuccess && (
          <Alert type="success" message={actionSuccess} className="mb-6" />
        )}

        {/* Filters and Search Bar */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6 justify-between items-center">
          <div className="flex rounded-xl bg-white border border-slate-200 p-1 w-full sm:w-auto shadow-sm">
            {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === tab
                    ? 'bg-slate-900 text-white shadow'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {tab === 'PENDING' ? 'Pending Approval' : tab}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search by shop, owner, GSTIN..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-800"
            />
          </div>
        </div>

        {/* Shops Queue */}
        {loading ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
            <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
              Loading merchant applications...
            </p>
          </div>
        ) : filteredShops.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
              <Store className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">No Applications Found</h3>
            <p className="text-xs text-slate-500">
              There are currently no shop registrations matching this filter.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredShops.map(s => (
              <div
                key={s.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base text-slate-900">{s.name}</h3>
                        <Badge status={s.status} />
                      </div>
                      <span className="text-xs text-slate-500 font-medium">
                        Proprietor: <strong>{s.owner_name}</strong>
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        State Code
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                        {s.state_code}
                      </span>
                    </div>
                  </div>

                  {/* Details box */}
                  <div className="bg-slate-50 rounded-xl p-3.5 space-y-2 text-xs border border-slate-100 my-3">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" /> GSTIN:
                      </span>
                      <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {s.gstin}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5" /> Mobile:
                      </span>
                      <span className="text-slate-800 font-semibold">{s.phone}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" /> Email:
                      </span>
                      <span className="text-slate-800">{s.email}</span>
                    </div>

                    <div className="flex items-start justify-between gap-2 pt-1 border-t border-slate-200/60">
                      <span className="text-slate-500 flex items-center gap-1.5 flex-shrink-0">
                        <MapPin className="w-3.5 h-3.5" /> Address:
                      </span>
                      <span className="text-right text-slate-700">{s.address}</span>
                    </div>

                    {/* Uploaded Document Preview Item */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-brand-900" /> Verification Doc:
                      </span>
                      {s.document_url ? (
                        <button
                          type="button"
                          onClick={() => setViewingDocShop(s)}
                          className="text-xs font-semibold text-brand-900 hover:text-brand-950 flex items-center gap-1 bg-brand-50 px-2 py-0.5 rounded border border-brand-200"
                        >
                          <Eye className="w-3 h-3" /> Verify Document
                        </button>
                      ) : (
                        <span className="text-slate-400 italic">No document</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Submitted: {new Date(s.created_at).toLocaleDateString()}
                  </span>

                  {s.status === 'PENDING' && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setRejectingShop(s);
                          setRejectReason('');
                          setRejectError(null);
                        }}
                        className="gap-1 px-3"
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </Button>

                      <Button
                        variant="primary"
                        size="sm"
                        isLoading={actionLoading === s.id}
                        onClick={() => handleApprove(s)}
                        className="gap-1 bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500 px-3"
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </Button>
                    </div>
                  )}

                  {s.status !== 'PENDING' && (
                    <div className="text-right">
                      <span className="text-[11px] text-slate-500 block">
                        Verified by: <strong>{s.verified_by || 'Admin'}</strong>
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {s.verified_at ? new Date(s.verified_at).toLocaleDateString() : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Document Verification Modal */}
        {viewingDocShop && (
          <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-brand-900" />
                    Document Verification: {viewingDocShop.name}
                  </h3>
                  <span className="text-xs text-slate-500">
                    Proprietor: {viewingDocShop.owner_name} • GSTIN: {viewingDocShop.gstin}
                  </span>
                </div>
                <button
                  onClick={() => setViewingDocShop(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-auto rounded-2xl border border-slate-200 bg-slate-900/5 flex items-center justify-center p-4">
                {viewingDocShop.document_url ? (
                  <img
                    src={viewingDocShop.document_url}
                    alt="Submitted Verification Document"
                    className="max-w-full max-h-[55vh] object-contain rounded-lg shadow-sm"
                  />
                ) : (
                  <p className="text-xs text-slate-500">No document image available</p>
                )}
              </div>

              <div className="mt-5 flex items-center justify-between pt-3 border-t border-slate-100">
                <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> JPEG/JPG Document Received
                </span>

                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setViewingDocShop(null)}>
                    Close
                  </Button>
                  {viewingDocShop.status === 'PENDING' && (
                    <Button
                      variant="primary"
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => {
                        const target = viewingDocShop;
                        setViewingDocShop(null);
                        handleApprove(target);
                      }}
                    >
                      <Check className="w-3.5 h-3.5 mr-1" /> Approve Shop
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reject Modal */}
        {rejectingShop && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center gap-3 text-rose-600 mb-4">
                <AlertCircle className="w-6 h-6" />
                <h3 className="text-lg font-bold text-slate-900">Reject Shop Registration</h3>
              </div>

              <p className="text-xs text-slate-600 mb-4">
                Please specify the reason for rejecting <strong>{rejectingShop.name}</strong> (GSTIN: {rejectingShop.gstin}). This explanation will be displayed to the merchant so they can correct their details and resubmit.
              </p>

              {rejectError && <Alert type="error" message={rejectError} className="mb-4" />}

              <form onSubmit={handleConfirmReject} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    Rejection Reason
                  </label>
                  <textarea
                    rows={3}
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="e.g. Uploaded document is illegible; GSTIN does not match proprietor name."
                    className="w-full rounded-xl border border-slate-300 p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    required
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRejectingShop(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="danger"
                    size="sm"
                    isLoading={actionLoading === rejectingShop.id}
                  >
                    Confirm Rejection
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
