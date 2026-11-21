import React, { useState } from 'react';
import { Plus, Sparkles, Filter, CheckCircle2, AlertTriangle, Layers, Calendar, User, Search, RefreshCw, Check } from 'lucide-react';
import { PolishingBatch, PolishingPersonSummary, formatPaiseToINR, PolishingStatus } from '@yorbalance/shared';
import { api } from '../../lib/api';
import { todayIST } from '../../lib/data/util';
import { useI18n } from '../../i18n';

interface Props {
  data: {
    batches: PolishingBatch[];
    totals: {
      total_entries: number;
      total_sarees_sent: number;
      total_sarees_received: number;
      pending_sarees: number;
      total_cost_paise: number;
    };
    person_summaries: PolishingPersonSummary[];
  };
  filter: { from: string; to: string };
  onFilterChange: (f: { from: string; to: string }) => void;
  onRefresh: () => void;
}

export const PolishingView: React.FC<Props> = ({ data, filter, onFilterChange, onRefresh }) => {
  const { fmtDate } = useI18n();
  const [addBatchOpen, setAddBatchOpen] = useState(false);
  const [receiveBatchOpen, setReceiveBatchOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<PolishingBatch | null>(null);

  const [sendForm, setSendForm] = useState({
    person_name: '',
    item_name: 'Pure Silk Saree',
    sarees_sent: '',
    unit_price: '',
    sent_date: todayIST(),
    notes: ''
  });

  const [receiveForm, setReceiveForm] = useState({
    sarees_received: '',
    received_date: todayIST(),
    notes: ''
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-calculated total on send modal
  const sendCount = parseInt(sendForm.sarees_sent, 10) || 0;
  const sendPrice = parseFloat(sendForm.unit_price) || 0;
  const autoTotalRupees = sendCount * sendPrice;

  const handleSendToPolish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendForm.person_name.trim() || !(sendCount > 0) || !(sendPrice >= 0)) {
      setError('Please provide person name, saree count, and unit price');
      return;
    }
    const unitPricePaise = Math.round(sendPrice * 100);

    setBusy(true);
    setError(null);
    try {
      await api.createPolishingBatch({
        person_name: sendForm.person_name.trim(),
        item_name: sendForm.item_name.trim(),
        sarees_sent: sendCount,
        unit_price_paise: unitPricePaise,
        sent_date: sendForm.sent_date,
        notes: sendForm.notes.trim() || null
      });
      setAddBatchOpen(false);
      setSendForm({
        person_name: '',
        item_name: 'Pure Silk Saree',
        sarees_sent: '',
        unit_price: '',
        sent_date: todayIST(),
        notes: ''
      });
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to dispatch to polishing');
    } finally {
      setBusy(false);
    }
  };

  const handleReceiveFromPolish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch) return;
    const receivedCount = parseInt(receiveForm.sarees_received, 10);
    if (!(receivedCount > 0) || receivedCount > selectedBatch.sarees_sent) {
      setError(`Received count must be between 1 and ${selectedBatch.sarees_sent}`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.updatePolishingBatch(selectedBatch.id, {
        sarees_received: receivedCount,
        received_date: receiveForm.received_date,
        notes: receiveForm.notes.trim() || null
      });
      setReceiveBatchOpen(false);
      setSelectedBatch(null);
      setReceiveForm({
        sarees_received: '',
        received_date: todayIST(),
        notes: ''
      });
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to update polishing batch');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Date Filter & Totals Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase">
            <Filter className="w-4 h-4 text-brand-900" />
            <span>Date Range:</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filter.from}
              onChange={e => onFilterChange({ ...filter, from: e.target.value })}
              className="h-9 px-3 rounded-xl border border-slate-300 text-xs font-medium focus:border-brand-700 focus:outline-none"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={filter.to}
              onChange={e => onFilterChange({ ...filter, to: e.target.value })}
              className="h-9 px-3 rounded-xl border border-slate-300 text-xs font-medium focus:border-brand-700 focus:outline-none"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setAddBatchOpen(true)}
          className="h-11 px-5 rounded-xl bg-brand-900 hover:bg-brand-950 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Send Sarees to Polish</span>
        </button>
      </div>

      {/* Dynamic Summary Cards for Filtered Range */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total Entries</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">{data.totals.total_entries}</span>
            <span className="text-xs font-medium text-slate-500">batches sent</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total Sarees Sent</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-brand-900">{data.totals.total_sarees_sent}</span>
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              {data.totals.total_sarees_received} back
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Pending at Polishers</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className={`text-2xl sm:text-3xl font-extrabold ${data.totals.pending_sarees > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {data.totals.pending_sarees}
            </span>
            <span className="text-xs font-medium text-slate-500">sarees in polish</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total Polishing Amount</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl sm:text-2xl font-extrabold text-slate-900">{formatPaiseToINR(data.totals.total_cost_paise)}</span>
            <span className="text-xs font-medium text-slate-500">for period</span>
          </div>
        </div>
      </div>

      {/* Pending Sarees Per Person Breakdown */}
      {data.person_summaries.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">Pending Sarees by Polisher / Person</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {data.person_summaries.map(p => (
              <div key={p.person_name} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm truncate">{p.person_name}</span>
                  <span className="text-xs font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                    {p.pending_sarees} pending
                  </span>
                </div>
                <div className="mt-2 flex justify-between text-xs text-slate-500">
                  <span>Sent: {p.total_sent}</span>
                  <span>Cost: {formatPaiseToINR(p.total_cost_paise)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Polishing Batches Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3.5 px-4">Date</th>
                <th className="py-3.5 px-3">Person Name</th>
                <th className="py-3.5 px-3">Saree Item</th>
                <th className="py-3.5 px-3 text-right">No. of Sarees</th>
                <th className="py-3.5 px-3 text-right">Unit Price</th>
                <th className="py-3.5 px-3 text-right">Total (₹)</th>
                <th className="py-3.5 px-3 text-center">Status</th>
                <th className="py-3.5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {data.batches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Sparkles className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-base font-semibold">No polishing entries in this date range.</p>
                    <p className="text-xs">Click "Send Sarees to Polish" to create a new batch.</p>
                  </td>
                </tr>
              ) : (
                data.batches.map(b => {
                  const isComplete = b.status === 'RECEIVED';
                  return (
                    <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 text-xs font-medium text-slate-600 whitespace-nowrap">
                        {fmtDate(b.sent_date)}
                      </td>
                      <td className="py-3.5 px-3 font-bold text-slate-900">
                        {b.person_name}
                      </td>
                      <td className="py-3.5 px-3 text-xs text-slate-700">
                        {b.item_name}
                      </td>
                      <td className="py-3.5 px-3 text-right font-bold text-brand-900 font-mono">
                        {b.sarees_sent} {b.sarees_received > 0 && <span className="text-xs font-normal text-slate-500">({b.sarees_received} rcvd)</span>}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-slate-600">
                        {formatPaiseToINR(b.unit_price_paise)}
                      </td>
                      <td className="py-3.5 px-3 text-right font-black text-slate-900 font-mono">
                        {formatPaiseToINR(b.total_amount_paise)}
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                            isComplete
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : b.status === 'PARTIAL'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-orange-50 text-orange-700 border-orange-200'
                          }`}
                        >
                          {b.status === 'RECEIVED' ? 'Received' : b.status === 'PARTIAL' ? 'Partial' : 'Pending'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {!isComplete ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedBatch(b);
                              setReceiveForm({
                                sarees_received: String(b.sarees_sent),
                                received_date: todayIST(),
                                notes: b.notes || ''
                              });
                              setReceiveBatchOpen(true);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Receive</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">Completed</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Send to Polishing Modal */}
      {addBatchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-1">Send Sarees to Polish</h3>
            <p className="text-xs text-slate-500 mb-4">Sarees sent are temporarily deducted from in-hand stock.</p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handleSendToPolish} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Person Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Polisher's name"
                    value={sendForm.person_name}
                    onChange={e => setSendForm({ ...sendForm, person_name: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={sendForm.sent_date}
                    onChange={e => setSendForm({ ...sendForm, sent_date: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Saree Item Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Pure Silk Saree"
                  value={sendForm.item_name}
                  onChange={e => setSendForm({ ...sendForm, item_name: e.target.value })}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Number of Sarees</label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="Count"
                    value={sendForm.sarees_sent}
                    onChange={e => setSendForm({ ...sendForm, sarees_sent: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm font-bold focus:border-brand-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Unit Price (₹/saree)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="Cost per saree"
                    value={sendForm.unit_price}
                    onChange={e => setSendForm({ ...sendForm, unit_price: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm font-bold focus:border-brand-700 focus:outline-none"
                  />
                </div>
              </div>

              {/* Auto Total Calculation Display */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-600">Total Polishing Charge:</span>
                <span className="text-base font-extrabold text-brand-900 font-mono">
                  {formatPaiseToINR(Math.round(autoTotalRupees * 100))}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Optional batch notes or expected return date"
                  value={sendForm.notes}
                  onChange={e => setSendForm({ ...sendForm, notes: e.target.value })}
                  className="w-full p-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddBatchOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-950 text-white text-sm font-bold shadow-md transition-colors disabled:opacity-50"
                >
                  {busy ? 'Saving...' : 'Send to Polish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive Sarees Modal */}
      {receiveBatchOpen && selectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-1">Receive Sarees from Polish</h3>
            <p className="text-xs text-slate-500 mb-4">
              Received sarees from {selectedBatch.person_name} are added back to in-hand stock.
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handleReceiveFromPolish} className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs space-y-1 text-slate-600">
                <div className="flex justify-between">
                  <span>Item:</span>
                  <span className="font-bold text-slate-900">{selectedBatch.item_name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Sarees Sent:</span>
                  <span className="font-bold text-slate-900">{selectedBatch.sarees_sent}</span>
                </div>
                <div className="flex justify-between">
                  <span>Unit Price:</span>
                  <span className="font-bold text-slate-900">{formatPaiseToINR(selectedBatch.unit_price_paise)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Sarees Received</label>
                  <input
                    type="number"
                    min="1"
                    max={selectedBatch.sarees_sent}
                    required
                    value={receiveForm.sarees_received}
                    onChange={e => setReceiveForm({ ...receiveForm, sarees_received: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm font-bold focus:border-brand-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Receipt Date</label>
                  <input
                    type="date"
                    required
                    value={receiveForm.received_date}
                    onChange={e => setReceiveForm({ ...receiveForm, received_date: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Finishing quality notes"
                  value={receiveForm.notes}
                  onChange={e => setReceiveForm({ ...receiveForm, notes: e.target.value })}
                  className="w-full p-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setReceiveBatchOpen(false);
                    setSelectedBatch(null);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-950 text-white text-sm font-bold shadow-md transition-colors disabled:opacity-50"
                >
                  {busy ? 'Saving...' : 'Confirm Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
