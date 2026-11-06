import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  Building2,
  Calendar,
  FileText,
  AlertCircle,
  CheckCircle2,
  Banknote,
  Landmark,
  Receipt
} from 'lucide-react';
import { Party, formatINR } from '@yorbalance/shared';
import { api, ApiError } from '../../lib/api';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialPartyId?: string;
  initialPartyName?: string;
  initialTransactionId?: string;
  initialInvoiceNumber?: string;
  initialRemainingRupees?: number;
  parties?: Party[];
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialPartyId,
  initialPartyName,
  initialTransactionId,
  initialInvoiceNumber,
  initialRemainingRupees,
  parties = []
}) => {
  const [partyId, setPartyId] = useState(initialPartyId || '');
  const [transactionId, setTransactionId] = useState(initialTransactionId || '');
  const [amountRupees, setAmountRupees] = useState(initialRemainingRupees ? initialRemainingRupees.toString() : '');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'CHEQUE' | 'NEFT'>('NEFT');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeDate, setChequeDate] = useState(new Date().toISOString().split('T')[0]);
  const [depositDate, setDepositDate] = useState('');
  const [clearingStatus, setClearingStatus] = useState<'PENDING' | 'CLEARED' | 'BOUNCED'>('PENDING');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPartyId(initialPartyId || (parties[0]?.id || ''));
      setTransactionId(initialTransactionId || '');
      setAmountRupees(initialRemainingRupees !== undefined && initialRemainingRupees > 0 ? initialRemainingRupees.toString() : '');
      setPaymentMode('NEFT');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setReferenceNumber('');
      setChequeNumber('');
      setDepositDate('');
      setClearingStatus('PENDING');
      setNotes('');
      setError(null);
    }
  }, [isOpen, initialPartyId, initialTransactionId, initialRemainingRupees, parties]);

  if (!isOpen) return null;

  const currentParty = parties.find(p => p.id === partyId) || (initialPartyName ? { name: initialPartyName } : null);
  const maxAllowed = initialRemainingRupees !== undefined ? initialRemainingRupees : null;

  const handleQuickAmount = (ratio: number) => {
    if (maxAllowed !== null && maxAllowed > 0) {
      const amt = Math.round(maxAllowed * ratio);
      setAmountRupees(amt.toString());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amt = parseFloat(amountRupees);
    if (isNaN(amt) || amt <= 0) {
      setError('Please enter a valid payment amount greater than zero.');
      return;
    }

    if (maxAllowed !== null && amt > maxAllowed) {
      setError(`Payment cannot exceed outstanding balance of ${formatINR(maxAllowed)}`);
      return;
    }

    if (paymentMode === 'CHEQUE' && !chequeNumber.trim()) {
      setError('Cheque Number is mandatory for Cheque payments.');
      return;
    }

    if (!partyId) {
      setError('Please select or verify the party.');
      return;
    }

    try {
      setLoading(true);
      await api.recordPayment({
        party_id: partyId,
        transaction_id: transactionId || null,
        amount_rupees: amt,
        payment_mode: paymentMode,
        payment_date: paymentDate,
        reference_number: referenceNumber.trim() || null,
        cheque_number: chequeNumber.trim() || null,
        cheque_date: paymentMode === 'CHEQUE' ? chequeDate : null,
        deposit_date: paymentMode === 'CHEQUE' && depositDate ? depositDate : null,
        clearing_status: paymentMode === 'CHEQUE' ? clearingStatus : 'CLEARED',
        notes: notes.trim() || null
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err.message || 'Failed to record payment');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 bg-gradient-to-br from-purple-900 via-indigo-950 to-slate-950 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/20 text-purple-200 border border-purple-400/30">
              <CreditCard className="w-3.5 h-3.5" /> Payment Receipt & Voucher
            </span>
          </div>

          <h2 className="font-serif-display text-2xl font-bold text-white tracking-tight">
            Record Payment
          </h2>
          <p className="text-xs text-purple-200 mt-1">
            Instantly update outstanding balances, cheque clearing, and bank settlements.
          </p>

          {/* Context pill if tied to specific invoice */}
          {initialInvoiceNumber && (
            <div className="mt-4 p-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase font-bold text-purple-300">Invoice Reference</p>
                <p className="font-mono font-bold text-white text-sm">{initialInvoiceNumber}</p>
                <p className="text-xs text-purple-200">{currentParty?.name}</p>
              </div>
              {maxAllowed !== null && (
                <div className="text-right">
                  <p className="text-[10px] uppercase font-bold text-purple-300">Remaining Balance</p>
                  <p className="font-mono font-bold text-amber-300 text-base">{formatINR(maxAllowed)}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* If no initial party provided, show party select */}
          {!initialPartyId && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Party / Merchant <span className="text-rose-500">*</span>
              </label>
              <select
                value={partyId}
                onChange={e => setPartyId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
              >
                <option value="">Select a party</option>
                {parties.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.type})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Payment Amount */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Payment Amount (₹) <span className="text-rose-500">*</span>
              </label>
              {maxAllowed !== null && maxAllowed > 0 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleQuickAmount(1)}
                    className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-semibold text-[10px] hover:bg-purple-100"
                  >
                    Full (100%)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickAmount(0.5)}
                    className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-semibold text-[10px] hover:bg-purple-100"
                  >
                    Half (50%)
                  </button>
                </div>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold">₹</span>
              <input
                type="number"
                step="any"
                min="1"
                max={maxAllowed !== null ? maxAllowed : undefined}
                required
                value={amountRupees}
                onChange={e => setAmountRupees(e.target.value)}
                placeholder="e.g. 50000"
                className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-slate-300 font-mono font-bold text-slate-900 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Payment Method <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMode('NEFT')}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border font-bold transition-all ${
                  paymentMode === 'NEFT'
                    ? 'border-purple-600 bg-purple-50 text-purple-800 shadow-sm ring-1 ring-purple-600'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Landmark className="w-4 h-4 mb-1" />
                <span>NEFT / RTGS / UPI</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMode('CHEQUE')}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border font-bold transition-all ${
                  paymentMode === 'CHEQUE'
                    ? 'border-purple-600 bg-purple-50 text-purple-800 shadow-sm ring-1 ring-purple-600'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Receipt className="w-4 h-4 mb-1" />
                <span>Bank Cheque</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMode('CASH')}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border font-bold transition-all ${
                  paymentMode === 'CASH'
                    ? 'border-purple-600 bg-purple-50 text-purple-800 shadow-sm ring-1 ring-purple-600'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Banknote className="w-4 h-4 mb-1" />
                <span>Cash Voucher</span>
              </button>
            </div>
          </div>

          {/* Conditional Fields: NEFT */}
          {paymentMode === 'NEFT' && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Bank UTR / Transaction Reference #
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={e => setReferenceNumber(e.target.value)}
                placeholder="e.g. UTR1029384756 or UPI Reference ID"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-slate-900 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>
          )}

          {/* Conditional Fields: CHEQUE */}
          {paymentMode === 'CHEQUE' && (
            <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-900 mb-1">
                    Cheque Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={chequeNumber}
                    onChange={e => setChequeNumber(e.target.value)}
                    placeholder="e.g. 000456"
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white font-mono text-slate-900 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-900 mb-1">
                    Cheque Date
                  </label>
                  <input
                    type="date"
                    value={chequeDate}
                    onChange={e => setChequeDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white text-slate-900 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-900 mb-1">
                    Deposit Date
                  </label>
                  <input
                    type="date"
                    value={depositDate}
                    onChange={e => setDepositDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white text-slate-900 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-900 mb-1">
                    Clearing Status
                  </label>
                  <select
                    value={clearingStatus}
                    onChange={e => setClearingStatus(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white font-bold text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  >
                    <option value="PENDING">Awaiting Clearance (Pending)</option>
                    <option value="CLEARED">Cleared / Honored</option>
                    <option value="BOUNCED">Bounced / Rejected</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Payment Date & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Payment Date
              </label>
              <input
                type="date"
                required
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Notes / Reference
              </label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Received via GPay at shop counter"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-md shadow-purple-600/20 transition-all flex items-center gap-2"
            >
              {loading ? (
                <span>Recording Payment...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Payment & Update Dues</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

