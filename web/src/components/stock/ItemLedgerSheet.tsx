import React from 'react';
import { X, ArrowDownLeft, ArrowUpRight, Calendar, Package, FileText } from 'lucide-react';
import { formatPaiseToINR } from '@yorbalance/shared';
import { useI18n } from '../../i18n';

interface LedgerRow {
  id: string;
  date: string;
  type: 'OPENING' | 'PURCHASE' | 'PRODUCTION' | 'SALE' | 'POLISH_SENT' | 'POLISH_RECEIVED' | 'RETURN';
  ref_no: string;
  party_name: string;
  qty_in: number;
  qty_out: number;
  running_balance: number;
  notes?: string | null;
}

interface Props {
  itemName: string;
  rows: LedgerRow[];
  onClose: () => void;
}

const TYPE_CONFIG: Record<LedgerRow['type'], { label: string; badge: string; isIn: boolean }> = {
  OPENING: { label: 'Opening Stock', badge: 'bg-purple-50 text-purple-700 border-purple-200', isIn: true },
  PURCHASE: { label: 'Purchase Bill', badge: 'bg-sky-50 text-sky-700 border-sky-200', isIn: true },
  PRODUCTION: { label: 'Weaver Production', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', isIn: true },
  SALE: { label: 'Sale Bill', badge: 'bg-amber-50 text-amber-700 border-amber-200', isIn: false },
  POLISH_SENT: { label: 'Sent to Polish', badge: 'bg-orange-50 text-orange-700 border-orange-200', isIn: false },
  POLISH_RECEIVED: { label: 'Received Polish', badge: 'bg-teal-50 text-teal-700 border-teal-200', isIn: true },
  RETURN: { label: 'Return / Credit', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', isIn: true }
};

export const ItemLedgerSheet: React.FC<Props> = ({ itemName, rows, onClose }) => {
  const { fmtDate } = useI18n();
  const currentBalance = rows.length > 0 ? rows[rows.length - 1].running_balance : 0;
  const totalIn = rows.reduce((sum, r) => sum + r.qty_in, 0);
  const totalOut = rows.reduce((sum, r) => sum + r.qty_out, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{itemName}</h2>
              <p className="text-xs text-slate-300">Item Stock Ledger & Movement History</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Balance Summary Header */}
        <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 border-b border-slate-200 text-center">
          <div className="bg-white p-3 rounded-2xl border border-slate-200">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">Total Received (+)</span>
            <span className="text-lg font-bold text-emerald-600">+{totalIn}</span>
          </div>
          <div className="bg-white p-3 rounded-2xl border border-slate-200">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">Total Dispatched (-)</span>
            <span className="text-lg font-bold text-amber-600">-{totalOut}</span>
          </div>
          <div className="bg-white p-3 rounded-2xl border border-slate-200">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">Closing Stock</span>
            <span className={`text-xl font-extrabold ${currentBalance <= 5 ? 'text-rose-600' : 'text-slate-900'}`}>
              {currentBalance}
            </span>
          </div>
        </div>

        {/* Ledger Entries List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 divide-y divide-slate-100">
          {rows.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-base font-semibold">No stock movements recorded yet.</p>
              <p className="text-xs">Purchases, sales, and weaver receipts will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Reference / Bill</th>
                    <th className="py-2.5 px-3">Party / Weaver</th>
                    <th className="py-2.5 px-3 text-right">In (+)</th>
                    <th className="py-2.5 px-3 text-right">Out (-)</th>
                    <th className="py-2.5 px-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {rows.map((r, i) => {
                    const cfg = TYPE_CONFIG[r.type];
                    return (
                      <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 whitespace-nowrap text-xs text-slate-600">
                          {fmtDate(r.date)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.badge}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap font-mono text-xs font-semibold text-slate-700">
                          #{r.ref_no}
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-900 font-semibold max-w-[180px] truncate">
                          {r.party_name}
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-600 font-bold whitespace-nowrap">
                          {r.qty_in > 0 ? `+${r.qty_in}` : '-'}
                        </td>
                        <td className="py-3 px-3 text-right text-rose-600 font-bold whitespace-nowrap">
                          {r.qty_out > 0 ? `-${r.qty_out}` : '-'}
                        </td>
                        <td className="py-3 px-3 text-right font-extrabold text-slate-900 whitespace-nowrap">
                          {r.running_balance}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm transition-colors shadow"
          >
            Close Ledger
          </button>
        </div>

      </div>
    </div>
  );
};
