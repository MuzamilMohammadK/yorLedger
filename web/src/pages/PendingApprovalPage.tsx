import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';
import {
  Clock,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Store,
  FileText,
  User,
  Phone,
  MapPin,
  ArrowRight,
  Edit3
} from 'lucide-react';
import { validateGSTIN, normalizePhone } from '@yorbalance/shared';

export const PendingApprovalPage: React.FC = () => {
  const { shop, latestVerification, refreshSession, logout } = useAuth();
  const navigate = useNavigate();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);

  // Edit fields for resubmission
  const [editData, setEditData] = useState({
    shop_name: shop?.name || '',
    owner_name: shop?.owner_name || '',
    gstin: shop?.gstin || '',
    mobile: shop?.phone || '',
    address: shop?.address || ''
  });
  const [resubmitError, setResubmitError] = useState<string | null>(null);

  // If approved, give prompt to enter dashboard
  if (shop?.status === 'APPROVED') {
    return (
      <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200 shadow-xl text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mx-auto mb-4">
            <CheckCircle className="w-8 h-8" />
          </div>
          <h2 className="font-serif-display text-2xl font-bold text-slate-900 mb-1">
            Shop Verification Approved!
          </h2>
          <p className="text-sm text-slate-600 mb-6">
            Congratulations! <strong>{shop.name}</strong> has been officially approved. You now have full access to your ledger, GST billing, and dues management.
          </p>
          <Button
            variant="primary"
            size="lg"
            className="w-full flex items-center justify-center gap-2"
            onClick={() => navigate('/dashboard')}
          >
            Enter Shop Dashboard <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshSession();
    setIsRefreshing(false);
  };

  const handleResubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResubmitError(null);

    // Validate
    const gstinRes = validateGSTIN(editData.gstin, true);
    if (!gstinRes.valid) {
      setResubmitError(gstinRes.error || 'Invalid GSTIN');
      return;
    }

    const normPhone = normalizePhone(editData.mobile);
    if (!normPhone) {
      setResubmitError('Enter a valid 10-digit mobile number');
      return;
    }

    try {
      setIsResubmitting(true);
      await api.resubmitShop({
        shop_name: editData.shop_name.trim(),
        owner_name: editData.owner_name.trim(),
        gstin: editData.gstin.trim().toUpperCase(),
        mobile: normPhone,
        address: editData.address.trim(),
        state_code: gstinRes.stateCode
      });
      await refreshSession();
      setShowEditForm(false);
    } catch (err: any) {
      setResubmitError(err.message || 'Failed to resubmit application.');
    } finally {
      setIsResubmitting(false);
    }
  };

  const isRejected = shop?.status === 'REJECTED';

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/40 via-slate-50 to-rose-50/30 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Status Banner */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                  isRejected ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                }`}
              >
                {isRejected ? <AlertTriangle className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  {isRejected ? 'Application Requires Revision' : 'Verification Under Review'}
                </h1>
                <p className="text-xs text-slate-500">Application Reference ID: {shop?.id || '—'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge status={shop?.status || 'PENDING'} />
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                isLoading={isRefreshing}
                className="gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh Status
              </Button>
            </div>
          </div>

          {/* Rejection Notice */}
          {isRejected && (
            <div className="mt-6">
              <Alert
                type="error"
                title="Reason for Rejection by Verification Officer"
                message={latestVerification?.reason || 'Details provided could not be verified against the official GST portal.'}
              />

              {!showEditForm ? (
                <div className="mt-4 p-4 rounded-2xl bg-rose-50/50 border border-rose-100 flex items-center justify-between">
                  <p className="text-xs text-rose-900">
                    You can update the flagged business details and resubmit your application immediately for re-evaluation.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setEditData({
                        shop_name: shop?.name || '',
                        owner_name: shop?.owner_name || '',
                        gstin: shop?.gstin || '',
                        mobile: shop?.phone || '',
                        address: shop?.address || ''
                      });
                      setShowEditForm(true);
                    }}
                    className="gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Correct Details
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleResubmit} className="mt-6 space-y-4 p-5 rounded-2xl border border-slate-200 bg-slate-50/50">
                  <h3 className="text-sm font-bold text-slate-900">Correct & Resubmit Application</h3>
                  {resubmitError && <Alert type="error" message={resubmitError} />}

                  <Input
                    label="Shop Name"
                    value={editData.shop_name}
                    onChange={e => setEditData({ ...editData, shop_name: e.target.value })}
                    required
                  />

                  <Input
                    label="Owner Name"
                    value={editData.owner_name}
                    onChange={e => setEditData({ ...editData, owner_name: e.target.value })}
                    required
                  />

                  <Input
                    label="GSTIN"
                    value={editData.gstin}
                    onChange={e => setEditData({ ...editData, gstin: e.target.value.toUpperCase() })}
                    maxLength={15}
                    required
                  />

                  <Input
                    label="Mobile Number"
                    value={editData.mobile}
                    onChange={e => setEditData({ ...editData, mobile: e.target.value })}
                    maxLength={10}
                    required
                  />

                  <Input
                    label="Full Shop Address"
                    value={editData.address}
                    onChange={e => setEditData({ ...editData, address: e.target.value })}
                    required
                  />

                  <div className="flex gap-2 pt-2">
                    <Button type="submit" variant="primary" isLoading={isResubmitting}>
                      Resubmit for Verification
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setShowEditForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Pending Info details */}
          {!isRejected && (
            <div className="mt-6 space-y-4">
              <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/60 text-xs text-amber-900 leading-relaxed">
                <p className="font-semibold mb-1">Approval Protocol in Progress</p>
                To maintain the integrity of commercial transactions and tax compliance across the silk and textile network, every merchant registration undergoes manual verification of the GSTIN, business address, and proprietor identity.
              </div>

              <div className="rounded-2xl border border-slate-200 p-5 space-y-3 bg-white">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Submitted Business Details
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-start gap-2">
                    <Store className="w-4 h-4 text-slate-400 mt-0.5" />
                    <div>
                      <span className="text-xs text-slate-500 block">Shop Name</span>
                      <strong className="text-slate-900">{shop?.name}</strong>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <User className="w-4 h-4 text-slate-400 mt-0.5" />
                    <div>
                      <span className="text-xs text-slate-500 block">Proprietor</span>
                      <strong className="text-slate-900">{shop?.owner_name}</strong>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                    <div>
                      <span className="text-xs text-slate-500 block">GSTIN</span>
                      <span className="font-mono font-bold text-slate-900">{shop?.gstin}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Phone className="w-4 h-4 text-slate-400 mt-0.5" />
                    <div>
                      <span className="text-xs text-slate-500 block">Mobile</span>
                      <span className="text-slate-900">{shop?.phone}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 sm:col-span-2">
                    <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                    <div>
                      <span className="text-xs text-slate-500 block">Shop Address</span>
                      <span className="text-slate-700">{shop?.address} (State: {shop?.state_code})</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Logged in as <strong>{shop?.email}</strong></span>
            <button
              onClick={logout}
              className="text-rose-600 hover:text-rose-800 font-semibold"
            >
              Sign out from this device
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

