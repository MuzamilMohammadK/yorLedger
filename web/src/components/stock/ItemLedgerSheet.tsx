import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Package, FileText, Edit3, Trash2, ExternalLink } from 'lucide-react';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';

export interface LedgerRow {
  id: string;
  date: string;
  type: 'OPENING' | 'PURCHASE' | 'PRODUCTION' | 'SALE' | 'POLISH_SENT' | 'POLISH_RECEIVED' | 'RETURN' | 'ADJUSTMENT';
  ref_no: string;
  party_name: string;
  qty_in: number;
  qty_out: number;
  running_balance: number;
  notes?: string | null;
  status?: 'ACTIVE' | 'VOID';
  void_reason?: string | null;
  source_bill_id?: string | null;
  can_edit?: boolean;
  can_void?: boolean;
}

interface Props {
  itemName: string;
  rows: LedgerRow[];
  includeVoided: boolean;
  onToggleVoided: (v: boolean) => void;
  onRefresh: () => void;
  onClose: () => void;
}

const TYPE_CONFIG: Record<LedgerRow['type'], { label: string; badge: string }> = {
  OPENING: { label: 'Opening Stock', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
  PURCHASE: { label: 'Purchase Bill', badge: 'bg-sky-50 text-sky-700 border-sky-200' },
  PRODUCTION: { label: 'Production', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  SALE: { label: 'Sale Bill', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  POLISH_SENT: { label: 'Sent to Polish', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
  POLISH_RECEIVED: { label: 'Received Polish', badge: 'bg-teal-50 text-teal-700 border-teal-200' },
  RETURN: { label: 'Return / Credit', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  ADJUSTMENT: { label: 'Adjustment', badge: 'bg-slate-100 text-slate-700 border-slate-300' }
};

export const ItemLedgerSheet: React.FC<Props> = ({
  itemName,
  rows,
  includeVoided,
  onToggleVoided,
  onRefresh,
  onClose
}) => {
  const { fmtDate } = useI18n();
  const navigate = useNavigate();
  const [voidTarget, setVoidTarget] = useState<LedgerRow | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidOverride, setVoidOverride] = useState(false);
  const [voidBlocked, setVoidBlocked] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<LedgerRow | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRows = rows.filter(r => r.status !== 'VOID');
  const currentBalance = activeRows.length > 0 ? activeRows[activeRows.length - 1].running_balance : 0;
  const totalIn = activeRows.reduce((sum, r) => sum + r.qty_in, 0);
  const totalOut = activeRows.reduce((sum, r) => sum + r.qty_out, 0);

  const confirmVoid = async () => {
    if (!voidTarget) return;
    if (!voidReason.trim()) {
      setError('Please enter a reason to void this entry');
      return;
    }
    setBusy(true);
    setError(null);
    setVoidBlocked(null);
    try {
      await api.voidStockMovement(voidTarget.id, voidReason.trim(), voidOverride);
      setVoidTarget(null);
      setVoidReason('');
      setVoidOverride(false);
      onRefresh();
    } catch (e: any) {
      if (e?.code === 'NEGATIVE_STOCK_BLOCK') {
        setVoidBlocked(e.message);
      } else {
        setError(e?.message ?? 'Failed to void entry');
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    const qty = parseInt(editQty, 10);
    if (!qty || qty === 0) {
      setError('Quantity must be non-zero');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.editStockMovement(editTarget.id, {
        date: editDate,
        qty,
        notes: editNotes
      });
      setEditTarget(null);
      onRefresh();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update entry');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-5xl max-h-[90vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{itemName}</h2>
              <p className="text-xs text-slate-300">Item Stock Ledger & Movement History</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={includeVoided}
                onChange={e => onToggleVoided(e.target.checked)}
                className="rounded border-slate-400"
              />
              <span>Show voided</span>
            </label>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 border-b border-slate-200 text-center">
          <div className="bg-white p-3 rounded-2xl border border-slate-200">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">Total Received (+)</span>
            <span className="text-lg font-bold text-emerald-600 tabular-nums">+{totalIn}</span>
          </div>
          <div className="bg-white p-3 rounded-2xl border border-slate-200">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">Total Dispatched (-)</span>
            <span className="text-lg font-bold text-amber-600 tabular-nums">-{totalOut}</span>
          </div>
          <div className="bg-white p-3 rounded-2xl border border-slate-200">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">Closing Stock</span>
            <span className={`text-xl font-extrabold tabular-nums ${currentBalance < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
              {currentBalance}
            </span>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>
        )}

        {voidTarget && (
          <div className="mx-6 mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 space-y-2.5">
            <p className="text-sm font-bold text-rose-900">
              Void "{voidTarget.party_name}" ({voidTarget.qty_in > 0 ? `+${voidTarget.qty_in}` : `-${voidTarget.qty_out}`})?
            </p>
            <p className="text-xs text-rose-800">
              Effect: {itemName} stock {currentBalance} → {currentBalance - voidTarget.qty_in + voidTarget.qty_out}
            </p>
            {voidBlocked && (
              <div className="rounded-xl bg-amber-50 border border-amber-300 p-2.5 text-xs text-amber-900 space-y-1.5">
                <p className="font-semibold">{voidBlocked}</p>
                <label className="inline-flex items-center gap-1.5 font-semibold">
                  <input type="checkbox" checked={voidOverride} onChange={e => setVoidOverride(e.target.checked)} />
                  <span>Owner override: allow negative stock</span>
                </label>
              </div>
            )}
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="text"
                value={voidReason}
                onChange={e => setVoidReason(e.target.value)}
                placeholder="Reason for voiding (required)..."
                className="flex-1 min-w-[200px] h-9 px-3 rounded-xl border border-rose-300 bg-white text-xs"
              />
              <button
                type="button"
                disabled={busy}
                onClick={confirmVoid}
                className="h-9 px-4 rounded-xl bg-rose-700 text-white text-xs font-bold disabled:opacity-50"
              >
                {busy ? 'Voiding...' : 'Confirm Void'}
              </button>
              <button
                type="button"
                onClick={() => { setVoidTarget(null); setVoidBlocked(null); setVoidOverride(false); }}
                className="h-9 px-3 rounded-xl border border-slate-300 bg-white text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {editTarget && (
          <form onSubmit={confirmEdit} className="mx-6 mt-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 space-y-2.5">
            <p className="text-sm font-bold text-indigo-900">Edit entry ({TYPE_CONFIG[editTarget.type].label})</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="h-9 px-3 rounded-xl border border-indigo-200 bg-white text-xs" />
              <input type="number" value={editQty} onChange={e => setEditQty(e.target.value)} placeholder="Signed qty" className="h-9 px-3 rounded-xl border border-indigo-200 bg-white text-xs" />
              <input type="text" value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Notes" className="h-9 px-3 rounded-xl border border-indigo-200 bg-white text-xs" />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="h-9 px-4 rounded-xl bg-indigo-700 text-white text-xs font-bold">
                Save Edit
              </button>
              <button type="button" onClick={() => setEditTarget(null)} className="h-9 px-3 rounded-xl border border-slate-300 bg-white text-xs font-semibold">
                Cancel
              </button>
            </div>
          </form>
        )}

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
                    <th className="py-2.5 px-3">Reference</th>
                    <th className="py-2.5 px-3">Party / Note</th>
                    <th className="py-2.5 px-3 text-right">In (+)</th>
                    <th className="py-2.5 px-3 text-right">Out (-)</th>
                    <th className="py-2.5 px-3 text-right">Balance</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {rows.map((r, i) => {
                    const cfg = TYPE_CONFIG[r.type];
                    const isVoid = r.status === 'VOID';
                    return (
                      <tr key={r.id || i} className={isVoid ? 'opacity-50 line-through bg-slate-50' : 'hover:bg-slate-50/80 transition-colors'}>
                        <td className="py-3 px-3 whitespace-nowrap text-xs text-slate-600">{fmtDate(r.date)}</td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.badge}`}>
                            {cfg.label}
                          </span>
                          {isVoid && <span className="ml-1 text-[10px] font-bold text-rose-700">VOID</span>}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap font-mono text-xs font-semibold text-slate-700">#{r.ref_no}</td>
                        <td className="py-3 px-3 text-xs text-slate-900 font-semibold max-w-[200px] truncate" title={r.void_reason || r.notes || r.party_name}>
                          {r.party_name}
                          {r.notes ? <span className="block text-[11px] font-normal text-slate-500 truncate">{r.notes}</span> : null}
                          {isVoid && r.void_reason ? <span className="block text-[11px] font-normal text-rose-600">Reason: {r.void_reason}</span> : null}
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-600 font-bold whitespace-nowrap tabular-nums">
                          {r.qty_in > 0 ? `+${r.qty_in}` : '-'}
                        </td>
                        <td className="py-3 px-3 text-right text-rose-600 font-bold whitespace-nowrap tabular-nums">
                          {r.qty_out > 0 ? `-${r.qty_out}` : '-'}
                        </td>
                        <td className="py-3 px-3 text-right font-extrabold text-slate-900 whitespace-nowrap tabular-nums">
                          {isVoid ? '—' : r.running_balance}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          {r.source_bill_id ? (
                            <button
                              type="button"
                              onClick={() => { onClose(); navigate(`/history?bill=${r.source_bill_id}`); }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                            >
                              <ExternalLink className="w-3 h-3" /> Open source
                            </button>
                          ) : !isVoid && (r.can_edit || r.can_void) ? (
                            <div className="inline-flex items-center gap-1">
                              {r.can_edit && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditTarget(r);
                                    setEditDate(r.date);
                                    setEditQty(String(r.qty_in > 0 ? r.qty_in : -r.qty_out));
                                    setEditNotes(r.notes ?? '');
                                    setError(null);
                                  }}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-700 hover:bg-indigo-50"
                                  title="Edit"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {r.can_void && (
                                <button
                                  type="button"
                                  onClick={() => { setVoidTarget(r); setVoidReason(''); setVoidBlocked(null); setError(null); }}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-700 hover:bg-rose-50"
                                  title="Void"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
