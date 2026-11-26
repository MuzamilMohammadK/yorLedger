import React, { useState } from 'react';
import { HsnBalanceRow } from '@yorbalance/shared';
import { api } from '../../lib/api';

interface Props {
  rows: HsnBalanceRow[];
  onRefresh: () => void;
}

export const HsnBalanceTable: React.FC<Props> = ({ rows, onRefresh }) => {
  const [editingHsn, setEditingHsn] = useState<string | null>(null);
  const [countVal, setCountVal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveCount = async (row: HsnBalanceRow) => {
    const qty = parseInt(countVal, 10);
    if (Number.isNaN(qty) || qty < 0) {
      setError('Enter a valid physical count (0 or more)');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.postStockCount({
        hsn_code: row.hsn_code,
        item_name: row.description,
        counted_qty: qty,
        book_balance: row.book_balance
      });
      setEditingHsn(null);
      setCountVal('');
      onRefresh();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to post count');
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = (status: HsnBalanceRow['status']) => {
    if (status === 'OVERSOLD') {
      return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">Oversold</span>;
    }
    if (status === 'SHORT') {
      return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">Short</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Balanced</span>;
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">HSN-wise stock balance</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Opening + Purchased + Produced − Sold + Returns ± Adjustments = Book balance
          </p>
        </div>
        <span className="text-xs text-slate-500">{rows.length} HSN groups</span>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {error}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate-500">No HSN stock data recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase font-bold text-slate-500">
                <th className="px-3 py-2.5 whitespace-nowrap">HSN</th>
                <th className="px-3 py-2.5">Description</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap">Opening</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap">Purchased</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap">Produced</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap">Sold</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap">Book balance</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap">With polishers</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap">Counted</th>
                <th className="px-3 py-2.5 whitespace-nowrap">Status</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(r => (
                <React.Fragment key={r.hsn_code}>
                  <tr className="hover:bg-slate-50/70">
                    <td className="px-3 py-2.5 font-mono text-xs font-bold text-indigo-700 whitespace-nowrap">{r.hsn_code}</td>
                    <td className="px-3 py-2.5 text-slate-800 max-w-[200px] truncate" title={r.description}>{r.description}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{r.opening}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{r.purchased}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{r.produced}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{r.sold}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap font-bold ${r.book_balance < 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                      {r.book_balance}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${r.polishing_data_error ? 'text-rose-700 font-semibold' : ''}`}>
                      {r.polishing_data_error ? (
                        <span title="Data error: more received than sent">⚠ {r.with_polishers}</span>
                      ) : r.with_polishers}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {editingHsn === r.hsn_code ? (
                        <input
                          type="number"
                          min={0}
                          value={countVal}
                          onChange={e => setCountVal(e.target.value)}
                          className="w-20 h-8 px-2 rounded-lg border border-indigo-400 text-right text-xs"
                          autoFocus
                        />
                      ) : (
                        r.counted ?? '—'
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{statusBadge(r.status)}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {editingHsn === r.hsn_code ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => saveCount(r)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-700 text-white text-xs font-semibold disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditingHsn(null); setError(null); }}
                            className="px-2 py-1 rounded-lg border border-slate-300 text-xs text-slate-600"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingHsn(r.hsn_code);
                            setCountVal(String(r.counted ?? Math.max(0, r.book_balance)));
                            setError(null);
                          }}
                          className="px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold"
                        >
                          Post count
                        </button>
                      )}
                    </td>
                  </tr>
                  {r.polishing_data_error && (
                    <tr className="bg-rose-50">
                      <td colSpan={11} className="px-4 py-1.5 text-xs text-rose-700">
                        ⚠ Polishing data error for HSN {r.hsn_code}: {r.polish_in} received back but only {r.polish_out} sent out. Check for duplicate receive entries.
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
