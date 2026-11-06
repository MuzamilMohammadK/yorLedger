import React, { useState, useEffect } from 'react';
import {
  X,
  Undo2,
  AlertCircle,
  CheckCircle2,
  FileText,
  Calendar
} from 'lucide-react';
import { Transaction, formatINR, formatPaiseToINR } from '@yorbalance/shared';
import { api, ApiError } from '../../lib/api';

interface AddReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  transaction: Transaction | null;
}

export const AddReturnModal: React.FC<AddReturnModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  transaction
}) => {
  const [amountRupees, setAmountRupees] = useState('');
  const [reason, setReason] = useState('Fabric / Weft Defect');
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAmountRupees('');
      setReason('Fabric / Weft Defect');
      setReturnDate(new Date().toISOString().split('T')[0]);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !transaction) return null;

  const currentReturns = transaction.return_paise || 0;
  const maxReturnPaise = transaction.grand_total_paise - currentReturns;
  const maxReturnRupees = Math.round(maxReturnPaise / 100);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amt = parseFloat(amountRupees);
    if (isNaN(amt) || amt <= 0) {
      setError('Please enter a valid return amount greater than zero.');
      return;
    }

    if (amt > maxReturnRupees) {
      setError(`Return amount cannot exceed maximum returnable amount of ${formatINR(maxReturnRupees)}`);
      return;
    }

    try {
      setLoading(true);
      await api.recordReturn({
        transaction_id: transaction.id,
        amount_rupees: amt,
        reason: reason.trim() || null,
        return_date: returnDate
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err.message || 'Failed to record return');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 bg-gradient-to-br from-rose-900 via-pink-950 to-slate-950 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-200 border border-rose-400/30">
              <Undo2 className="w-3.5 h-3.5" /> Credit Return Note
            </span>
          </div>

          <h2 className="font-serif-display text-2xl font-bold text-white tracking-tight">
            Record Return
          </h2>
          <p className="text-xs text-rose-200 mt-1">
            Deduct returned sarees or materials from {transaction.invoice_number}
          </p>

          <div className="mt-4 p-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-between text-xs">
            <div>
              <p className="text-[10px] uppercase font-bold text-rose-300">Invoice Total</p>
              <p className="font-mono font-bold text-white">{formatPaiseToINR(transaction.grand_total_paise)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-rose-300">Max Returnable</p>
              <p className="font-mono font-bold text-amber-300">{formatINR(maxReturnRupees)}</p>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Return Amount (₹) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold">₹</span>
              <input
                type="number"
                step="any"
                min="1"
                max={maxReturnRupees}
                required
                value={amountRupees}
                onChange={e => setAmountRupees(e.target.value)}
                placeholder="e.g. 15000"
                className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-slate-300 font-mono font-bold text-slate-900 text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Reason for Return
            </label>
            <select
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
            >
              <option value="Fabric / Weft Defect">Fabric / Weft Defect</option>
              <option value="Zari Korvai Issue">Zari Korvai Issue</option>
              <option value="Color Shade Mismatch">Color Shade Mismatch</option>
              <option value="Customer Cancellation">Customer Cancellation</option>
              <option value="Quality Inspection Rejection">Quality Inspection Rejection</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Return Date
            </label>
            <input
              type="date"
              required
              value={returnDate}
              onChange={e => setReturnDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />
          </div>

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
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-md shadow-rose-600/20 transition-all flex items-center gap-2"
            >
              {loading ? (
                <span>Recording Return...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm Return</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

