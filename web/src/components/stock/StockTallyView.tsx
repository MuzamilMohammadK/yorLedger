import React, { useState } from 'react';
import { Search, Plus, AlertTriangle, Layers, ArrowUpDown, ChevronRight, CheckCircle2, TrendingUp, Filter } from 'lucide-react';
import { StockItemSummary, formatPaiseToINR } from '@yorbalance/shared';
import { api } from '../../lib/api';
import { ItemLedgerSheet } from './ItemLedgerSheet';
import { todayIST } from '../../lib/data/util';

interface Props {
  items: StockItemSummary[];
  onRefresh: () => void;
}

export const StockTallyView: React.FC<Props> = ({ items, onRefresh }) => {
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [ledgerRows, setLedgerRows] = useState<any[]>([]);
  const [openingModalOpen, setOpeningModalOpen] = useState(false);
  const [openingForm, setOpeningForm] = useState({ item_name: '', qty: '', rate: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = items.filter(it => {
    const matchSearch = it.item_name.toLowerCase().includes(search.toLowerCase());
    const matchLow = lowStockOnly ? it.is_low_stock : true;
    return matchSearch && matchLow;
  });

  const totalFinishedSarees = items.reduce((sum, it) => sum + it.closing_balance, 0);
  const totalInHand = items.reduce((sum, it) => sum + it.in_hand_balance, 0);
  const totalValuationPaise = items.reduce((sum, it) => sum + it.stock_value_paise, 0);
  const lowStockCount = items.filter(it => it.is_low_stock).length;

  const handleOpenLedger = async (name: string) => {
    setSelectedItem(name);
    try {
      const rows = await api.getItemLedger(name);
      setLedgerRows(rows);
    } catch (e) {
      console.error('Failed to load item ledger', e);
    }
  };

  const handleSaveOpening = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openingForm.item_name.trim() || !openingForm.qty) {
      setError('Please provide item name and quantity');
      return;
    }
    const qty = parseInt(openingForm.qty, 10);
    if (!(qty > 0)) {
      setError('Quantity must be greater than zero');
      return;
    }
    const ratePaise = openingForm.rate ? Math.round(parseFloat(openingForm.rate) * 100) : undefined;
    setBusy(true);
    setError(null);
    try {
      await api.recordStockMovement({
        item_name: openingForm.item_name.trim(),
        movement_type: 'OPENING',
        qty,
        rate_paise: ratePaise,
        date: todayIST(),
        notes: openingForm.notes.trim() || null
      });
      setOpeningModalOpen(false);
      setOpeningForm({ item_name: '', qty: '', rate: '', notes: '' });
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to save opening stock');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Finished Saree Items</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">{items.length}</span>
            <span className="text-xs font-medium text-slate-500">catalog types</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total Sarees In Stock</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-brand-900">{totalFinishedSarees}</span>
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{totalInHand} in-hand</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Stock Valuation</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl sm:text-2xl font-extrabold text-slate-900">{formatPaiseToINR(totalValuationPaise)}</span>
            <span className="text-xs font-medium text-slate-500">at cost</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Low Stock Alert</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className={`text-2xl sm:text-3xl font-extrabold ${lowStockCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {lowStockCount}
            </span>
            <span className="text-xs font-medium text-slate-500">&le; 5 sarees</span>
          </div>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search finished saree by item name..."
            className="w-full h-11 pl-11 pr-4 rounded-xl border border-slate-200 text-sm focus:border-brand-700 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLowStockOnly(!lowStockOnly)}
            className={`h-11 px-4 rounded-xl border text-sm font-semibold flex items-center gap-2 transition-colors ${
              lowStockOnly
                ? 'bg-rose-50 border-rose-300 text-rose-700'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            <span>Low Stock</span>
          </button>

          <button
            type="button"
            onClick={() => setOpeningModalOpen(true)}
            className="h-11 px-4 rounded-xl bg-brand-900 hover:bg-brand-950 text-white text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Set Opening Stock</span>
          </button>
        </div>
      </div>

      {/* Finished Stock Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3.5 px-4">Item Name</th>
                <th className="py-3.5 px-3 text-right">Opening</th>
                <th className="py-3.5 px-3 text-right">Purchased (+)</th>
                <th className="py-3.5 px-3 text-right">Produced (+)</th>
                <th className="py-3.5 px-3 text-right">Sold (-)</th>
                <th className="py-3.5 px-3 text-right">In Polish (-)</th>
                <th className="py-3.5 px-3 text-right">Returned (+)</th>
                <th className="py-3.5 px-3 text-right">In-Hand</th>
                <th className="py-3.5 px-3 text-right">Closing</th>
                <th className="py-3.5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <Layers className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-base font-semibold">No finished stock records found.</p>
                    <p className="text-xs">Add an opening stock entry or record bills to populate stock tally.</p>
                  </td>
                </tr>
              ) : (
                filtered.map(it => {
                  const inPolish = Math.max(0, it.sent_to_polish - it.received_from_polish);
                  return (
                    <tr
                      key={it.item_name}
                      onClick={() => handleOpenLedger(it.item_name)}
                      className="hover:bg-amber-50/50 cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <span>{it.item_name}</span>
                          {it.is_low_stock && (
                            <span className="px-2 py-0.5 text-[10px] font-extrabold bg-rose-50 border border-rose-200 text-rose-600 rounded-md">
                              LOW
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-right text-slate-500 font-mono">{it.opening}</td>
                      <td className="py-3.5 px-3 text-right text-sky-700 font-bold font-mono">
                        {it.purchased > 0 ? `+${it.purchased}` : '0'}
                      </td>
                      <td className="py-3.5 px-3 text-right text-emerald-700 font-bold font-mono">
                        {it.produced > 0 ? `+${it.produced}` : '0'}
                      </td>
                      <td className="py-3.5 px-3 text-right text-amber-700 font-bold font-mono">
                        {it.sold > 0 ? `-${it.sold}` : '0'}
                      </td>
                      <td className="py-3.5 px-3 text-right text-orange-700 font-bold font-mono">
                        {inPolish > 0 ? `-${inPolish}` : '0'}
                      </td>
                      <td className="py-3.5 px-3 text-right text-indigo-700 font-bold font-mono">
                        {it.returned > 0 ? `+${it.returned}` : '0'}
                      </td>
                      <td className="py-3.5 px-3 text-right font-extrabold text-emerald-700 font-mono">
                        {it.in_hand_balance}
                      </td>
                      <td className="py-3.5 px-3 text-right font-black text-slate-900 text-base font-mono">
                        {it.closing_balance}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-900 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-xl transition-colors">
                          Ledger <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Item Ledger Modal Sheet */}
      {selectedItem && (
        <ItemLedgerSheet
          itemName={selectedItem}
          rows={ledgerRows}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {/* Opening Stock Modal */}
      {openingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-1">Set Opening Stock</h3>
            <p className="text-xs text-slate-500 mb-4">Initialize the starting count for finished sarees.</p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handleSaveOpening} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Saree / Item Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kanchipuram Pure Silk, Banarasi Brocade"
                  value={openingForm.item_name}
                  onChange={e => setOpeningForm({ ...openingForm, item_name: e.target.value })}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Quantity (Sarees)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="Count"
                    value={openingForm.qty}
                    onChange={e => setOpeningForm({ ...openingForm, qty: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Unit Cost (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Optional ₹"
                    value={openingForm.rate}
                    onChange={e => setOpeningForm({ ...openingForm, rate: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Notes / Description</label>
                <textarea
                  rows={2}
                  placeholder="Opening inventory as of date"
                  value={openingForm.notes}
                  onChange={e => setOpeningForm({ ...openingForm, notes: e.target.value })}
                  className="w-full p-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpeningModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-950 text-white text-sm font-bold shadow-md transition-colors disabled:opacity-50"
                >
                  {busy ? 'Saving...' : 'Save Opening Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
