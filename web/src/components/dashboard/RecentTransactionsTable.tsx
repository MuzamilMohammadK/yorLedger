import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Transaction, formatINR } from '@yorbalance/shared';
import {
  Search,
  Receipt,
  FileText,
  Eye,
  ExternalLink,
  X,
  Store,
  User,
  Calendar,
  CreditCard,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';

interface RecentTransactionsTableProps {
  transactions: Transaction[];
  loading?: boolean;
}

export const RecentTransactionsTable: React.FC<RecentTransactionsTableProps> = ({
  transactions,
  loading = false
}) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const filtered = transactions.filter(tx => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      tx.invoice_number.toLowerCase().includes(q) ||
      tx.party_name.toLowerCase().includes(q) ||
      tx.type.toLowerCase().includes(q)
    );
  });

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'SALE':
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Sale</span>;
      case 'PURCHASE':
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">Purchase</span>;
      case 'JOB_WORK':
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Job Work</span>;
      case 'RETURN':
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">Return</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">{type}</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SETTLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Settled
          </span>
        );
      case 'PARTIAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" /> Partial Due
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3 h-3 text-rose-600" /> Unpaid
          </span>
        );
      default:
        return <span className="text-xs text-slate-600">{status}</span>;
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
      {/* Header & Controls */}
      <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-serif-display text-base sm:text-lg font-bold text-slate-900">
              Recent Transactions
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
              {transactions.length} Recorded
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Latest sales, wholesale purchases, and artisan job work vouchers
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search invoice or party..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          </div>

          <Link
            to="/history"
            className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-700 hover:underline shrink-0"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <th className="py-3 px-5">Party Details</th>
              <th className="py-3 px-4">Invoice No.</th>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4 text-right">Bill Total</th>
              <th className="py-3 px-4">Payment Status</th>
              <th className="py-3 px-5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
            {loading ? (
              [1, 2, 3, 4, 5].map(i => (
                <tr key={i} className="animate-pulse">
                  <td className="py-4 px-5"><div className="h-4 bg-slate-100 rounded w-36" /></td>
                  <td className="py-4 px-4"><div className="h-4 bg-slate-100 rounded w-20" /></td>
                  <td className="py-4 px-4"><div className="h-4 bg-slate-100 rounded w-16" /></td>
                  <td className="py-4 px-4"><div className="h-4 bg-slate-100 rounded w-14" /></td>
                  <td className="py-4 px-4 text-right"><div className="h-4 bg-slate-100 rounded w-20 ml-auto" /></td>
                  <td className="py-4 px-4"><div className="h-4 bg-slate-100 rounded w-20" /></td>
                  <td className="py-4 px-5 text-right"><div className="h-4 bg-slate-100 rounded w-12 ml-auto" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                  <p className="font-semibold text-sm text-slate-600">No transactions found</p>
                  <p className="text-xs text-slate-400 mt-1">Try adjusting your search criteria or date filter.</p>
                </td>
              </tr>
            ) : (
              filtered.map(tx => (
                <tr
                  key={tx.id}
                  className="hover:bg-slate-50/70 transition-colors group cursor-pointer"
                  onClick={() => setSelectedTx(tx)}
                >
                  <td className="py-3.5 px-5">
                    <div className="font-bold text-slate-900 group-hover:text-purple-600 transition-colors">
                      {tx.party_name}
                    </div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wide">
                      {tx.party_type}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono font-semibold text-slate-700">
                    {tx.invoice_number}
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                    {new Date(tx.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {getTypeBadge(tx.type)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                    {formatINR(tx.grand_total_paise / 100)}
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {getStatusBadge(tx.status)}
                  </td>
                  <td className="py-3.5 px-5 text-right whitespace-nowrap">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedTx(tx);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 font-semibold text-xs transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" /> Details
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ----------------- View Details Modal ----------------- */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-400">
                    Bill Inspection
                  </span>
                  {getTypeBadge(selectedTx.type)}
                </div>
                <h3 className="font-serif-display text-xl font-bold text-white mt-1">
                  Invoice: {selectedTx.invoice_number}
                </h3>
              </div>
              <button
                onClick={() => setSelectedTx(null)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700">
              {/* Party & Date Banner */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400 font-semibold uppercase text-[10px] block">Customer / Party</span>
                  <strong className="text-slate-900 text-sm block">{selectedTx.party_name}</strong>
                  <span className="text-slate-500">{selectedTx.party_type}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold uppercase text-[10px] block">Invoice Date</span>
                  <strong className="text-slate-900 text-sm block">
                    {new Date(selectedTx.invoice_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </strong>
                  <div className="mt-1">{getStatusBadge(selectedTx.status)}</div>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-2">
                  Itemized Saree & Silk Inventory
                </h4>
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500 font-bold">
                      <tr>
                        <th className="p-3">Item Description</th>
                        <th className="p-3 text-center">Qty</th>
                        <th className="p-3 text-right">Rate</th>
                        <th className="p-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedTx.items || []).map((item, idx) => (
                        <tr key={idx}>
                          <td className="p-3 font-semibold text-slate-900">{item.item_name}</td>
                          <td className="p-3 text-center font-mono">{item.quantity}</td>
                          <td className="p-3 text-right font-mono">{formatINR(item.rate_paise / 100)}</td>
                          <td className="p-3 text-right font-mono font-bold">{formatINR(item.amount_paise / 100)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial & Tax Breakdown */}
              <div className="p-4 rounded-2xl bg-purple-50/50 border border-purple-100 space-y-2">
                <div className="flex justify-between text-slate-600">
                  <span>Taxable Subtotal:</span>
                  <span className="font-mono font-bold">{formatINR(selectedTx.subtotal_paise / 100)}</span>
                </div>
                {selectedTx.cgst_paise > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>CGST:</span>
                    <span className="font-mono">{formatINR(selectedTx.cgst_paise / 100)}</span>
                  </div>
                )}
                {selectedTx.sgst_paise > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>SGST:</span>
                    <span className="font-mono">{formatINR(selectedTx.sgst_paise / 100)}</span>
                  </div>
                )}
                {selectedTx.igst_paise > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>IGST:</span>
                    <span className="font-mono">{formatINR(selectedTx.igst_paise / 100)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-purple-200 flex justify-between font-bold text-sm text-slate-900">
                  <span>Grand Total (INR):</span>
                  <span className="font-mono text-purple-700 text-base">{formatINR(selectedTx.grand_total_paise / 100)}</span>
                </div>
              </div>

              {/* Payment Summary */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Paid Amount</span>
                  <span className="text-emerald-600 font-mono font-bold text-sm">
                    {formatINR(selectedTx.paid_paise / 100)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Balance Pending</span>
                  <span className={`font-mono font-bold text-sm ${selectedTx.pending_paise > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                    {formatINR(selectedTx.pending_paise / 100)}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                onClick={() => setSelectedTx(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setSelectedTx(null);
                  navigate('/history');
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-colors"
              >
                Open in Full Ledger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

