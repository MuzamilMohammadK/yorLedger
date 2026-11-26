import React, { useState } from 'react';
import { PolishSummaryResult, TallyPolishInput, formatPaiseToINR } from '@yorbalance/shared';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n';
import { PolishForm } from './PolishForm';
import { PartyOption } from './TallyFilters';

interface Props {
  summary: PolishSummaryResult;
  entries: TallyPolishInput[];
  parties: PartyOption[];
  defaultHsn?: string;
  onRefresh: () => void;
}

export const PolishPanel: React.FC<Props> = ({ summary, entries, parties, defaultHsn, onRefresh }) => {
  const { fmtDate } = useI18n();
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [receiveQty, setReceiveQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReceive = async (entry: TallyPolishInput) => {
    const q = parseInt(receiveQty, 10) || 0;
    const pending = Math.max(0, entry.qty - entry.received_qty);
    if (q <= 0 || q > pending) {
      setError(`Enter a quantity between 1 and ${pending}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.receivePolish(entry.id, { receive_qty: q });
      setReceivingId(null);
      setReceiveQty('');
      onRefresh();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to receive from polisher');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-bold text-slate-900">Polishing panel</h3>
          <p className="text-xs text-slate-500">Track sarees given out, received back, and per-polisher cost</p>
        </div>
      </div>

      <PolishForm parties={parties} defaultHsn={defaultHsn} onSuccess={onRefresh} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3">
          <p className="text-[11px] font-bold uppercase text-slate-500">Entries</p>
          <p className="mt-0.5 text-xl font-extrabold text-slate-900 tabular-nums">{summary.entries_count}</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3">
          <p className="text-[11px] font-bold uppercase text-slate-500">Total No. of sarees</p>
          <p className="mt-0.5 text-xl font-extrabold text-indigo-700 tabular-nums">{summary.total_sarees}</p>
          <p className="text-[11px] text-slate-500 tabular-nums">{summary.pending_sarees} with polishers</p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3">
          <p className="text-[11px] font-bold uppercase text-slate-500">Average unit price</p>
          <p className="mt-0.5 text-xl font-extrabold text-slate-900 tabular-nums">
            {formatPaiseToINR(summary.avg_unit_price_paise, true)}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3">
          <p className="text-[11px] font-bold uppercase text-slate-500">Total cost</p>
          <p className="mt-0.5 text-xl font-extrabold text-emerald-700 tabular-nums">
            {formatPaiseToINR(summary.total_cost_paise, true)}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>
      )}

      {summary.person_summaries.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase font-bold text-slate-500">
                <th className="px-3 py-2">Polisher</th>
                <th className="px-3 py-2 text-right">Entries</th>
                <th className="px-3 py-2 text-right">Sarees</th>
                <th className="px-3 py-2 text-right">Unit price</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Returned / given</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.person_summaries.map(p => (
                <tr key={p.party_key}>
                  <td className="px-3 py-2 font-semibold text-slate-900">{p.person_name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.entries}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.sarees_given}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPaiseToINR(p.avg_unit_price_paise, true)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold">{formatPaiseToINR(p.total_paise, true)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.sarees_received} / {p.sarees_given}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500 border border-dashed border-slate-300 rounded-xl">
          No polishing entries for the selected filter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase font-bold text-slate-500">
                <th className="px-3 py-2 whitespace-nowrap">Date</th>
                <th className="px-3 py-2">Polisher</th>
                <th className="px-3 py-2">HSN / Item</th>
                <th className="px-3 py-2 text-right">Given</th>
                <th className="px-3 py-2 text-right">Received</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map(e => {
                const pending = Math.max(0, e.qty - e.received_qty);
                return (
                  <tr key={e.id}>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums text-slate-600">{fmtDate(e.date)}</td>
                    <td className="px-3 py-2 font-semibold text-slate-900">{e.person_name}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {e.hsn_code ? <span className="font-mono text-xs text-indigo-700 mr-1.5">{e.hsn_code}</span> : null}
                      {e.item_name}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{e.qty}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{e.received_qty}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatPaiseToINR(e.total_paise, true)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {pending === 0 ? (
                        <span className="text-xs font-semibold text-emerald-700">Completed</span>
                      ) : receivingId === e.id ? (
                        <div className="inline-flex items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={pending}
                            value={receiveQty}
                            onChange={ev => setReceiveQty(ev.target.value)}
                            className="w-16 h-8 px-2 rounded-lg border border-indigo-400 text-right text-xs"
                            autoFocus
                          />
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleReceive(e)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-700 text-white text-xs font-semibold disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => { setReceivingId(null); setError(null); }}
                            className="px-2 py-1 rounded-lg border border-slate-300 text-xs text-slate-600"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setReceivingId(e.id);
                            setReceiveQty(String(pending));
                            setError(null);
                          }}
                          className="px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold"
                        >
                          Receive ({pending})
                        </button>
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
  );
};
