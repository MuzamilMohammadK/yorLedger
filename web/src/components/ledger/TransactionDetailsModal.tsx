import React from 'react';
import {
  X,
  FileText,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  ShoppingBag,
  Truck,
  Sparkles,
  ArrowRight,
  CreditCard,
  Undo2,
  Printer
} from 'lucide-react';
import { Transaction, formatINR, formatPaiseToINR } from '@yorbalance/shared';

interface TransactionDetailsModalProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenPartyLedger?: (partyId: string) => void;
  onRecordPayment?: (tx: Transaction) => void;
  onAddReturn?: (tx: Transaction) => void;
}

export const TransactionDetailsModal: React.FC<TransactionDetailsModalProps> = ({
  transaction,
  isOpen,
  onClose,
  onOpenPartyLedger,
  onRecordPayment,
  onAddReturn
}) => {
  if (!isOpen || !transaction) return null;

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'SALE':
        return { label: 'Sale Invoice', icon: <ShoppingBag className="w-3.5 h-3.5" />, classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'PURCHASE':
        return { label: 'Purchase Bill', icon: <Truck className="w-3.5 h-3.5" />, classes: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'JOB_WORK':
        return { label: 'Job Work Voucher', icon: <Sparkles className="w-3.5 h-3.5" />, classes: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'PAYMENT':
        return { label: 'Payment Voucher', icon: <CreditCard className="w-3.5 h-3.5" />, classes: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'RETURN':
        return { label: 'Return Note', icon: <Undo2 className="w-3.5 h-3.5" />, classes: 'bg-rose-50 text-rose-700 border-rose-200' };
      default:
        return { label: type, icon: <FileText className="w-3.5 h-3.5" />, classes: 'bg-slate-50 text-slate-700 border-slate-200' };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SETTLED':
        return { label: 'Fully Settled', icon: <CheckCircle2 className="w-3 h-3" />, classes: 'bg-emerald-100/80 text-emerald-800 border-emerald-200' };
      case 'PARTIAL':
        return { label: 'Partially Paid', icon: <Clock className="w-3 h-3" />, classes: 'bg-blue-100/80 text-blue-800 border-blue-200' };
      case 'OVERDUE':
        return { label: 'Payment Overdue', icon: <AlertCircle className="w-3 h-3" />, classes: 'bg-rose-100/80 text-rose-800 border-rose-200' };
      default:
        return { label: 'Payment Pending', icon: <AlertCircle className="w-3 h-3" />, classes: 'bg-amber-100/80 text-amber-800 border-amber-200' };
    }
  };

  const typeBadge = getTypeBadge(transaction.type);
  const statusBadge = getStatusBadge(transaction.status);
  const remainingPaise = Math.max(0, transaction.grand_total_paise - (transaction.return_paise || 0) - transaction.paid_paise);
  const isSettled = remainingPaise === 0;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 bg-gradient-to-br from-slate-900 via-purple-950 to-indigo-950 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${typeBadge.classes} bg-white/95 shadow-sm`}>
              {typeBadge.icon} {typeBadge.label}
            </span>
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusBadge.classes} bg-white/95 shadow-sm`}>
              {statusBadge.icon} {statusBadge.label}
            </span>
          </div>

          <h2 className="font-serif-display text-2xl font-bold text-white tracking-tight">
            {transaction.invoice_number}
          </h2>

          <div className="flex flex-wrap items-center gap-3 text-xs text-purple-200 mt-1">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-purple-300" />
              <span>Invoice Date: <strong className="text-white font-medium">{transaction.invoice_date}</strong></span>
            </div>
            {transaction.due_date && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-300" />
                <span>Due Date: <strong className="text-amber-200 font-medium">{transaction.due_date}</strong></span>
              </div>
            )}
          </div>

          {/* Amount Spotlight */}
          <div className="mt-5 p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-purple-200 font-semibold">
                Grand Total Amount
              </p>
              <div className="text-2xl font-mono font-bold text-white mt-0.5">
                {formatPaiseToINR(transaction.grand_total_paise)}
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-purple-300 font-semibold">
                Remaining Due
              </p>
              <div className={`text-base font-mono font-bold mt-0.5 ${remainingPaise > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                {formatPaiseToINR(remainingPaise)}
              </div>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 text-xs text-slate-600 max-h-[60vh] overflow-y-auto">
          {/* Party Information */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Transacting Party</span>
                <p className="text-xs font-bold text-slate-900">{transaction.party_name}</p>
                <span className="text-[10px] text-purple-700 font-semibold capitalize">{transaction.party_type.toLowerCase()}</span>
              </div>
            </div>
            {onOpenPartyLedger && (
              <button
                onClick={() => {
                  onClose();
                  onOpenPartyLedger(transaction.party_id);
                }}
                className="text-[11px] font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1 bg-purple-50 px-2.5 py-1.5 rounded-lg transition-colors"
              >
                View Ledger <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Line Items (if any) */}
          {transaction.items && transaction.items.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Billed Items / Description
              </h4>
              <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-2xl overflow-hidden bg-slate-50/50">
                {transaction.items.map((it, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-slate-800">{it.item_name}</p>
                      <span className="text-[11px] text-slate-400">
                        Qty: {it.quantity} &bull; Rate: {formatPaiseToINR(it.rate_paise)}
                      </span>
                    </div>
                    <div className="font-mono font-bold text-slate-900">
                      {formatPaiseToINR(it.amount_paise)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Financial Breakdown Table */}
          <div className="space-y-2 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="flex justify-between text-slate-500 text-xs">
              <span>Subtotal (Taxable Value)</span>
              <span className="font-mono font-semibold text-slate-800">{formatPaiseToINR(transaction.subtotal_paise)}</span>
            </div>

            {transaction.cgst_paise > 0 && (
              <div className="flex justify-between text-slate-500 text-xs">
                <span>CGST (Central Tax)</span>
                <span className="font-mono font-semibold text-slate-800">{formatPaiseToINR(transaction.cgst_paise)}</span>
              </div>
            )}

            {transaction.sgst_paise > 0 && (
              <div className="flex justify-between text-slate-500 text-xs">
                <span>SGST (State Tax)</span>
                <span className="font-mono font-semibold text-slate-800">{formatPaiseToINR(transaction.sgst_paise)}</span>
              </div>
            )}

            {transaction.igst_paise > 0 && (
              <div className="flex justify-between text-slate-500 text-xs">
                <span>IGST (Interstate Tax)</span>
                <span className="font-mono font-semibold text-slate-800">{formatPaiseToINR(transaction.igst_paise)}</span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-200/60 flex justify-between font-bold text-slate-900 text-xs">
              <span>Original Grand Total</span>
              <span className="font-mono text-sm">{formatPaiseToINR(transaction.grand_total_paise)}</span>
            </div>

            {transaction.return_paise && transaction.return_paise > 0 ? (
              <div className="flex justify-between text-rose-600 font-semibold text-xs">
                <span>Total Goods Returned (-)</span>
                <span className="font-mono">-{formatPaiseToINR(transaction.return_paise)}</span>
              </div>
            ) : null}

            <div className="flex justify-between text-emerald-700 font-semibold text-xs">
              <span>Total Payments Recorded (-)</span>
              <span className="font-mono">-{formatPaiseToINR(transaction.paid_paise)}</span>
            </div>

            <div className="pt-2 border-t border-slate-200/60 flex justify-between font-bold text-slate-900 text-xs">
              <span>Remaining Balance Due</span>
              <span className={`font-mono text-sm ${remainingPaise > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {formatPaiseToINR(remainingPaise)}
              </span>
            </div>
          </div>

          {/* Payment History List */}
          {transaction.payments && transaction.payments.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Payment History
              </h4>
              <div className="space-y-1.5">
                {transaction.payments.map((p, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-purple-50/50 border border-purple-100 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-purple-900">{p.payment_mode}</span>
                        {p.reference_number && <span className="font-mono text-[10px] text-slate-500">Ref: {p.reference_number}</span>}
                        {p.cheque_number && <span className="font-mono text-[10px] text-slate-500">Chq: #{p.cheque_number}</span>}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">{p.payment_date}</p>
                    </div>
                    <div className="font-mono font-bold text-emerald-700">
                      +{formatINR(p.amount_rupees)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Returns History List */}
          {transaction.returns && transaction.returns.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Returns & Credit Notes
              </h4>
              <div className="space-y-1.5">
                {transaction.returns.map((r, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-rose-50/50 border border-rose-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-rose-900">{r.reason || 'Goods Return'}</span>
                      <p className="text-[10px] text-slate-400 mt-0.5">{r.return_date}</p>
                    </div>
                    <div className="font-mono font-bold text-rose-700">
                      -{formatINR(r.amount_rupees)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {transaction.notes && (
            <div className="p-3 rounded-xl bg-purple-50/50 border border-purple-100 text-purple-950 text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 block mb-0.5">
                Transaction Notes
              </span>
              <p>{transaction.notes}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-semibold text-xs transition-colors flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> Print Bill
          </button>

          <div className="flex items-center gap-2">
            {!isSettled && onAddReturn && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onAddReturn(transaction);
                }}
                className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-colors flex items-center gap-1"
              >
                <Undo2 className="w-3.5 h-3.5" /> Add Return
              </button>
            )}

            {!isSettled && onRecordPayment && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRecordPayment(transaction);
                }}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition-colors shadow-sm shadow-purple-600/20 flex items-center gap-1.5"
              >
                <CreditCard className="w-3.5 h-3.5" /> Record Payment
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
