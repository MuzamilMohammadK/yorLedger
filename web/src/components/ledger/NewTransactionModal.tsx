import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  BookOpen,
  Building2,
  Calendar,
  FileText,
  IndianRupee,
  ShoppingBag,
  Truck,
  Sparkles,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { Party, Transaction, TransactionType, CreateTransactionPayload, formatINR } from '@yorbalance/shared';
import { api } from '../../lib/api';

interface NewTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (tx: Transaction) => void;
  parties: Party[];
  preselectedPartyId?: string | null;
  onNavigateToNewParty?: () => void;
}

export const NewTransactionModal: React.FC<NewTransactionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  parties,
  preselectedPartyId,
  onNavigateToNewParty
}) => {
  const [partyId, setPartyId] = useState('');
  const [type, setType] = useState<TransactionType>('SALE');
  const [amountRupees, setAmountRupees] = useState('');
  const [paidRupees, setPaidRupees] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [itemName, setItemName] = useState('');
  const [isInterState, setIsInterState] = useState(false);
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (preselectedPartyId) {
      setPartyId(preselectedPartyId);
      const party = parties.find(p => p.id === preselectedPartyId);
      if (party) {
        if (party.type === 'CUSTOMER') setType('SALE');
        else if (party.type === 'SUPPLIER') setType('PURCHASE');
        else if (party.type === 'ARTISAN') setType('JOB_WORK');
      }
    } else if (parties.length > 0 && !partyId) {
      setPartyId(parties[0].id);
    }
  }, [preselectedPartyId, parties, isOpen]);

  // Adjust default type when party changes
  const handlePartyChange = (selectedId: string) => {
    setPartyId(selectedId);
    const p = parties.find(part => part.id === selectedId);
    if (p) {
      if (p.type === 'CUSTOMER') setType('SALE');
      else if (p.type === 'SUPPLIER') setType('PURCHASE');
      else if (p.type === 'ARTISAN') setType('JOB_WORK');
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!partyId) {
      errs.partyId = 'Please select a party';
    }
    const amt = parseFloat(amountRupees);
    if (isNaN(amt) || amt <= 0) {
      errs.amountRupees = 'Please enter a valid transaction amount';
    }
    const paid = parseFloat(paidRupees);
    if (paidRupees && (isNaN(paid) || paid < 0 || paid > amt)) {
      errs.paidRupees = 'Paid amount cannot exceed total bill amount';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setServerError(null);

    try {
      const payload: CreateTransactionPayload = {
        party_id: partyId,
        type,
        amount_rupees: parseFloat(amountRupees),
        paid_rupees: paidRupees ? parseFloat(paidRupees) : 0,
        invoice_number: invoiceNumber.trim() || undefined,
        invoice_date: invoiceDate,
        item_name: itemName.trim() || undefined,
        is_inter_state: isInterState,
        notes: notes.trim() || null
      };

      const res = await api.createTransaction(payload);
      onSuccess(res.transaction);
      onClose();
    } catch (err: any) {
      console.error('Create transaction error:', err);
      setServerError(err.message || 'Failed to record transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const selectedParty = parties.find(p => p.id === partyId);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-purple-200 backdrop-blur-md">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif-display text-lg font-bold">
                Record Ledger Transaction
              </h2>
              <p className="text-xs text-purple-200">
                Create a sale bill, purchase invoice, or weaver job work voucher
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {serverError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          {/* Party Selector */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Select Party <span className="text-rose-500">*</span>
              </label>
              {onNavigateToNewParty && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateToNewParty();
                  }}
                  className="text-[11px] font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Party doesn't exist? Create Now
                </button>
              )}
            </div>

            <select
              value={partyId}
              onChange={e => handlePartyChange(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
            >
              {parties.length === 0 ? (
                <option value="">No parties registered yet</option>
              ) : (
                parties.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.type}) &bull; Bal: {formatINR(p.current_balance || 0)}
                  </option>
                ))
              )}
            </select>
            {errors.partyId && <p className="text-[11px] text-rose-500 mt-1">{errors.partyId}</p>}

            {selectedParty && (
              <div className="mt-1.5 p-2 rounded-xl bg-purple-50/70 text-[11px] text-purple-900 flex items-center justify-between">
                <span>Prop: <strong>{selectedParty.owner_name}</strong> &bull; {selectedParty.phone}</span>
                <span className="font-mono font-bold">Ledger: {formatINR(selectedParty.current_balance || 0)}</span>
              </div>
            )}
          </div>

          {/* Transaction Type Segmented Buttons */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Voucher Type <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setType('SALE')}
                className={`py-2 px-3 rounded-xl border text-center text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  type === 'SALE'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-slate-50/50 text-slate-600'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" /> Sale Bill
              </button>
              <button
                type="button"
                onClick={() => setType('PURCHASE')}
                className={`py-2 px-3 rounded-xl border text-center text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  type === 'PURCHASE'
                    ? 'border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20'
                    : 'border-slate-200 bg-slate-50/50 text-slate-600'
                }`}
              >
                <Truck className="w-3.5 h-3.5 text-blue-600" /> Purchase
              </button>
              <button
                type="button"
                onClick={() => setType('JOB_WORK')}
                className={`py-2 px-3 rounded-xl border text-center text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  type === 'JOB_WORK'
                    ? 'border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-500/20'
                    : 'border-slate-200 bg-slate-50/50 text-slate-600'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" /> Job Work
              </button>
            </div>
          </div>

          {/* Amount and Paid Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Total Bill Amount (₹) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₹</span>
                <input
                  type="number"
                  step="0.01"
                  value={amountRupees}
                  onChange={e => setAmountRupees(e.target.value)}
                  placeholder="0.00"
                  className={`w-full pl-8 pr-3 py-2 bg-slate-50 border rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all ${
                    errors.amountRupees ? 'border-rose-400' : 'border-slate-200'
                  }`}
                />
              </div>
              {errors.amountRupees && <p className="text-[11px] text-rose-500 mt-0.5">{errors.amountRupees}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Amount Paid Today (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₹</span>
                <input
                  type="number"
                  step="0.01"
                  value={paidRupees}
                  onChange={e => setPaidRupees(e.target.value)}
                  placeholder="0.00"
                  className={`w-full pl-8 pr-3 py-2 bg-slate-50 border rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all ${
                    errors.paidRupees ? 'border-rose-400' : 'border-slate-200'
                  }`}
                />
              </div>
              {errors.paidRupees && <p className="text-[11px] text-rose-500 mt-0.5">{errors.paidRupees}</p>}
            </div>
          </div>

          {/* Invoice Number & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Invoice / Bill Number <span className="text-slate-400 font-normal">(Auto if empty)</span>
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={e => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-2026-088"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Invoice Date
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
              />
            </div>
          </div>

          {/* Item Description & Interstate Tax */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Item Description
            </label>
            <input
              type="text"
              value={itemName}
              onChange={e => setItemName(e.target.value)}
              placeholder="e.g. Pure Kanchipuram Bridal Silk Saree / Mulberry Yarn"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="interstate"
              checked={isInterState}
              onChange={e => setIsInterState(e.target.checked)}
              className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
            />
            <label htmlFor="interstate" className="text-xs text-slate-700 font-medium cursor-pointer">
              Inter-State Transaction (Apply full 5% IGST instead of CGST + SGST)
            </label>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Credit terms, cheque details, or loom remarks"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold shadow-md transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Recording...
                </>
              ) : (
                'Save Transaction'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

