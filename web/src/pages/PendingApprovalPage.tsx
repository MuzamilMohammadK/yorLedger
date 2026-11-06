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
  Edit3,
  Image as ImageIcon,
  ExternalLink,
  UploadCloud,
  CheckCircle2,
  X,
  AlertCircle
} from 'lucide-react';
import { validateGSTIN, normalizePhone } from '@yorbalance/shared';

export const PendingApprovalPage: React.FC = () => {
  const { shop, latestVerification, refreshSession, logout } = useAuth();
  const navigate = useNavigate();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);

  // Edit fields for resubmission
  const [editData, setEditData] = useState({
    shop_name: shop?.name || '',
    owner_name: shop?.owner_name || '',
    gstin: shop?.gstin || '',
    mobile: shop?.phone || '',
    address: shop?.address || ''
  });
  const [editDocUrl, setEditDocUrl] = useState<string | null>(shop?.document_url || null);
  const [editDocName, setEditDocName] = useState<string | null>(shop?.document_name || null);
  const [editDocError, setEditDocError] = useState<string | null>(null);
  const [resubmitError, setResubmitError] = useState<string | null>(null);

  // Shop status is watched live by AuthContext (Firestore listener) — no polling needed.

  // If approved, show congratulatory screen and allow redirect to Dashboard
  if (shop?.status === 'APPROVED') {
    return (
      <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200 shadow-xl text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mx-auto mb-4">
            <CheckCircle className="w-8 h-8" />
          </div>
          <h2 className="font-serif-display text-2xl font-bold text-slate-900 mb-1">
            Shop Registration Approved!
          </h2>
          <p className="text-sm text-slate-600 mb-2">
            Congratulations! <strong>{shop.name}</strong> has been officially verified by the administration team.
          </p>
          <div className="bg-slate-50 rounded-xl p-3 my-4 text-sm text-slate-500 border border-slate-200">
            <span>Verified by: <strong>{shop.verified_by || 'Admin'}</strong></span>
            <span className="block mt-0.5">Timestamp: {shop.verified_at ? new Date(shop.verified_at).toLocaleString() : 'Just now'}</span>
          </div>
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

  const handleDocFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditDocError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const isJpeg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);
    if (!isJpeg) {
      setEditDocError('Document must be strictly in JPEG or JPG format.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setEditDocError('Document size must not exceed 5 MB.');
      return;
    }

    setEditDocName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setEditDocUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
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

    if (editDocUrl) {
      const isJpeg = editDocUrl.startsWith('data:image/jpeg') || 
                     editDocUrl.startsWith('data:image/jpg') ||
                     /\.(jpg|jpeg)(\?.*)?$/i.test(editDocUrl);
      if (!isJpeg) {
        setResubmitError('Document must be in JPEG or JPG format');
        return;
      }
    }

    try {
      setIsResubmitting(true);
      await api.resubmitShop({
        shop_name: editData.shop_name.trim(),
        owner_name: editData.owner_name.trim(),
        gstin: editData.gstin.trim().toUpperCase(),
        mobile: normPhone,
        address: editData.address.trim(),
        state_code: gstinRes.stateCode,
        document_url: editDocUrl,
        document_name: editDocName
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
                  {isRejected ? 'Application Requires Revision' : 'Waiting for Admin Approval'}
                </h1>
                <p className="text-sm text-slate-500">Application Reference ID: {shop?.id || '—'}</p>
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
                message={latestVerification?.reason || 'Details provided could not be verified against official documentation.'}
              />

              {!showEditForm ? (
                <div className="mt-4 p-4 rounded-2xl bg-rose-50/50 border border-rose-100 flex items-center justify-between">
                  <p className="text-sm text-rose-900">
                    You can update your business details or re-upload your verification document and resubmit for approval.
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
                      setEditDocUrl(shop?.document_url || null);
                      setEditDocName(shop?.document_name || null);
                      setShowEditForm(true);
                    }}
                    className="gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Correct & Resubmit
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

                  {/* Document re-upload */}
                  <div className="pt-2">
                    <label className="block text-sm font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                      Updated Verification Document (JPEG/JPG)
                    </label>
                    {editDocError && (
                      <p className="text-sm text-rose-600 mb-1">{editDocError}</p>
                    )}
                    <div className="flex items-center gap-3">
                      {editDocUrl && (
                        <div className="w-12 h-12 rounded-lg border bg-white overflow-hidden flex-shrink-0">
                          <img src={editDocUrl} alt="Document" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <input
                        type="file"
                        accept=".jpg,.jpeg,image/jpeg"
                        onChange={handleDocFileChange}
                        className="text-sm text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-amber-100 file:text-amber-900 hover:file:bg-amber-200 cursor-pointer"
                      />
                    </div>
                  </div>

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
              <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/60 text-sm text-amber-900 leading-relaxed">
                <p className="font-semibold mb-1">Approval Protocol in Progress</p>
                Your registration and uploaded documents have been received and queued for review. In accordance with system security rules, access to the dashboard and ledger remains restricted until an administrator verifies your application.
              </div>

              <div className="rounded-2xl border border-slate-200 p-5 space-y-3 bg-white">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Submitted Business Details
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-start gap-2">
                    <Store className="w-4 h-4 text-slate-400 mt-0.5" />
                    <div>
                      <span className="text-sm text-slate-500 block">Shop Name</span>
                      <strong className="text-slate-900">{shop?.name}</strong>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <User className="w-4 h-4 text-slate-400 mt-0.5" />
                    <div>
                      <span className="text-sm text-slate-500 block">Proprietor</span>
                      <strong className="text-slate-900">{shop?.owner_name}</strong>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                    <div>
                      <span className="text-sm text-slate-500 block">GSTIN</span>
                      <span className="font-mono font-bold text-slate-900">{shop?.gstin}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Phone className="w-4 h-4 text-slate-400 mt-0.5" />
                    <div>
                      <span className="text-sm text-slate-500 block">Mobile</span>
                      <span className="text-slate-900">{shop?.phone}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 sm:col-span-2">
                    <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                    <div>
                      <span className="text-sm text-slate-500 block">Shop Address</span>
                      <span className="text-slate-700">{shop?.address} (State: {shop?.state_code})</span>
                    </div>
                  </div>
                </div>

                {/* Uploaded Document Inspection */}
                <div className="pt-3 border-t border-slate-100">
                  <span className="text-sm text-slate-500 block mb-2 font-semibold">
                    Submitted Document (JPEG/JPG)
                  </span>
                  {shop?.document_url ? (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-white border border-slate-300 overflow-hidden flex items-center justify-center">
                          <img
                            src={shop.document_url}
                            alt="Verification Document"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div>
                          <span className="text-sm font-bold text-slate-900 block">
                            {shop.document_name || 'Shop_Document.jpg'}
                          </span>
                          <span className="text-sm text-emerald-700 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> JPEG Upload Verified
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDocModal(true)}
                        className="text-sm gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> View
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 italic">No document on file</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
            <span>Logged in as <strong>{shop?.email}</strong></span>
            <button
              onClick={logout}
              className="text-rose-600 hover:text-rose-800 font-semibold"
            >
              Sign out from this device
            </button>
          </div>
        </div>

        {/* Document Modal */}
        {showDocModal && shop?.document_url && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-brand-900" />
                  {shop.document_name || 'Shop Verification Document'}
                </h3>
                <button
                  onClick={() => setShowDocModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center p-2">
                <img
                  src={shop.document_url}
                  alt="Shop Verification Document"
                  className="max-w-full max-h-[65vh] object-contain rounded-lg"
                />
              </div>

              <div className="mt-4 flex justify-end">
                <Button variant="secondary" size="sm" onClick={() => setShowDocModal(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
