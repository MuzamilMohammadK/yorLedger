import React, { useEffect, useState } from 'react';
import { Search, Plus, AlertTriangle, Layers, ChevronRight, Undo2, GitMerge } from 'lucide-react';
import { StockItemSummary, finishedStockStatus, formatPaiseToINR } from '@yorbalance/shared';
import { api } from '../../lib/api';
import { ItemLedgerSheet, LedgerRow } from './ItemLedgerSheet';
import { todayIST } from '../../lib/data/util';

interface Props {
  items: StockItemSummary[];
  onRefresh: () => void;
}

export const StockTallyView: React.FC<Props> = ({ items, onRefresh }) => {
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [includeVoided, setIncludeVoided] = useState(false);
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);
  const [openingModalOpen, setOpeningModalOpen] = useState(false);
  const [openingForm, setOpeningForm] = useState({
    movement_type: 'OPENING' as 'OPENING' | 'PRODUCTION' | 'ADJUSTMENT',
    date: todayIST(),
    item_name: '',
    qty: '',
    rate: '',
    notes: ''
  });
  const [undoToast, setUndoToast] = useState<{ id: string; label: string } | null>(null);
  const [tallyBookBalance, setTallyBookBalance] = useState<number | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSource, setMergeSource] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');
  const [mergeSuccess, setMergeSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.getTally().then(t => {
      if (active) setTallyBookBalance(t.equation.book_balance);
    }).catch(() => {});
    return () => { active = false; };
  }, [items]);

  useEffect(() => {
    if (!undoToast) return;
    const t = window.setTimeout(() => setUndoToast(null), 30000);
    return () => window.clearTimeout(t);
  }, [undoToast]);

  const statusOf = (it: StockItemSummary) =>
    finishedStockStatus(it.closing_balance, it.low_stock_threshold ?? 5);

  const filtered = items.filter(it => {
    const matchSearch = it.item_name.toLowerCase().includes(search.toLowerCase());
    const st = statusOf(it);
    const matchLow = lowStockOnly ? (st === 'LOW' || st === 'OUT' || st === 'NEGATIVE') : true;
    return matchSearch && matchLow;
  });

  const totalFinishedSarees = items.reduce((sum, it) => sum + it.closing_balance, 0);
  const totalInHand = items.reduce((sum, it) => sum + it.in_hand_balance, 0);
  const totalValuationPaise = items.reduce((sum, it) => sum + it.stock_value_paise, 0);
  const lowStockCount = items.filter(it => {
    const st = statusOf(it);
    return st === 'LOW' || st === 'OUT';
  }).length;
  const negativeItems = items.filter(it => it.closing_balance < 0);

  const loadLedger = async (name: string, showVoided: boolean) => {
    try {
      const rows = await api.getItemLedger(name, showVoided);
      setLedgerRows(rows as LedgerRow[]);
    } catch (e) {
      console.error('Failed to load item ledger', e);
    }
  };

  const handleOpenLedger = async (name: string) => {
    setSelectedItem(name);
    await loadLedger(name, includeVoided);
  };

  const handleSaveOpening = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openingForm.item_name.trim() || !openingForm.qty) {
      setError('Please provide item name and quantity');
      return;
    }
    const qty = parseInt(openingForm.qty, 10);
    if (!qty || (openingForm.movement_type !== 'ADJUSTMENT' && qty <= 0)) {
      setError(openingForm.movement_type === 'ADJUSTMENT' ? 'Adjustment quantity cannot be 0' : 'Quantity must be greater than zero');
      return;
    }
    const ratePaise = openingForm.rate ? Math.round(parseFloat(openingForm.rate) * 100) : undefined;
    setBusy(true);
    setError(null);
    try {
      const id = await api.recordStockMovement({
        item_name: openingForm.item_name.trim(),
        movement_type: openingForm.movement_type,
        qty,
        rate_paise: ratePaise,
        date: openingForm.date || todayIST(),
        notes: openingForm.notes.trim() || null
      });
      setUndoToast({ id, label: `Stock updated: ${qty > 0 ? `+${qty}` : qty} ${openingForm.item_name.trim()} (${openingForm.movement_type})` });
      setOpeningModalOpen(false);
      setOpeningForm({ movement_type: 'OPENING', date: todayIST(), item_name: '', qty: '', rate: '', notes: '' });
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to save stock entry');
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = async () => {
    if (!undoToast) return;
    try {
      await api.voidStockMovement(undoToast.id, 'Quick undo within 30s', true);
      setUndoToast(null);
      onRefresh();
    } catch (e: any) {
      setError(e?.message ?? 'Undo failed');
    }
  };

  const handleMergeItems = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mergeSource || !mergeTarget || mergeSource === mergeTarget) {
      setError('Select two different items to merge');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.mergeStockItems(mergeSource, mergeTarget);
      setMergeSuccess(`Merged "${mergeSource}" into "${mergeTarget}" (${res.movementsUpdated} movements, ${res.billsUpdated} bills, ${res.polishingUpdated} polishing entries updated).`);
      setMergeOpen(false);
      setMergeSource('');
      setMergeTarget('');
      onRefresh();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to merge items');
    } finally {
      setBusy(false);
    }
  };

  const statusChip = (it: StockItemSummary) => {
    const st = statusOf(it);
    if (st === 'NEGATIVE') return <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-extrabold bg-rose-100 border border-rose-300 text-rose-800 rounded">NEGATIVE</span>;
    if (st === 'OUT') return <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-extrabold bg-slate-100 border border-slate-300 text-slate-700 rounded">OUT</span>;
    if (st === 'LOW') return <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-extrabold bg-amber-50 border border-amber-200 text-amber-800 rounded">LOW</span>;
    return <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-extrabold bg-emerald-50 border border-emerald-200 text-emerald-700 rounded">OK</span>;
  };

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-600 bg-white border border-slate-200 rounded-2xl px-4 py-2.5">
        <strong>What is this page for?</strong> Track finished saree stock from opening balances, purchases, weaver production, polishing, and sales. Click any item row to open its full ledger and Edit or Void manual entries.
      </p>

      {mergeSuccess && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 flex items-center justify-between gap-3 text-xs font-semibold">
          <span>{mergeSuccess}</span>
          <button type="button" onClick={() => setMergeSuccess(null)} className="text-emerald-700 hover:underline">Dismiss</button>
        </div>
      )}

      {tallyBookBalance !== null && tallyBookBalance !== totalFinishedSarees && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
          <span>
            <strong>Stock consistency check:</strong> Finished Stock total (<b>{totalFinishedSarees}</b>) differs from Tally book balance (<b>{tallyBookBalance}</b>) by <b>{totalFinishedSarees - tallyBookBalance}</b>. Check unmapped/voided movements or job-work lines.
          </span>
        </div>
      )}

      {undoToast && (
        <div className="rounded-2xl bg-slate-900 text-white px-4 py-3 flex items-center justify-between gap-3 shadow-lg">
          <span className="text-xs font-semibold">Saved {undoToast.label}</span>
          <button
            type="button"
            onClick={handleUndo}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-amber-400 text-slate-950 text-xs font-bold hover:bg-amber-300"
          >
            <Undo2 className="w-3.5 h-3.5" /> Undo
          </button>
        </div>
      )}

      {negativeItems.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-rose-900">
              {negativeItems.length} item(s) have negative stock (sold before opening/production was entered)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {negativeItems.map(n => (
              <button
                key={n.item_name}
                type="button"
                onClick={() => {
                  setOpeningForm({
                    movement_type: 'OPENING',
                    date: todayIST(),
                    item_name: n.item_name,
                    qty: String(Math.abs(n.closing_balance)),
                    rate: n.unit_price_paise ? String(n.unit_price_paise / 100) : '',
                    notes: 'Fix negative stock opening balance'
                  });
                  setOpeningModalOpen(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-white border border-rose-300 text-xs font-bold text-rose-800 hover:bg-rose-100"
              >
                Fix {n.item_name} ({n.closing_balance}) → +{Math.abs(n.closing_balance)}
              </button>
            ))}
          </div>
        </div>
      )}
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

        <div className="flex flex-wrap items-center gap-2">
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

          {items.length >= 2 && (
            <button
              type="button"
              onClick={() => { setError(null); setMergeOpen(true); }}
              className="h-11 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold flex items-center gap-2 transition-colors"
            >
              <GitMerge className="w-4 h-4 text-indigo-600" />
              <span>Merge Items</span>
            </button>
          )}

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

      {/* Finished Stock Table (container-query responsive, zero horizontal scroll) */}
      <div className="stock-table-wrap bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
        <div className="stock-head bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
          <div>Item Name</div>
          <div className="text-right">Opening</div>
          <div className="text-right">Purchased</div>
          <div className="text-right">Produced</div>
          <div className="text-right">Sold</div>
          <div className="text-right">Polish</div>
          <div className="text-right">Returned</div>
          <div className="text-right">In-Hand</div>
          <div className="text-right">Closing</div>
          <div className="text-center">Action</div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <Layers className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-base font-semibold">No finished stock records found.</p>
            <p className="text-xs">Add an opening stock entry or record bills to populate stock tally.</p>
          </div>
        ) : (
          filtered.map(it => {
            const inPolish = Math.max(0, it.sent_to_polish - it.received_from_polish);
            return (
              <div key={it.item_name} className="min-w-0">
                {/* Desktop Grid Row (>= 860px container) */}
                <div
                  onClick={() => handleOpenLedger(it.item_name)}
                  className="stock-desktop-only stock-row hover:bg-amber-50/50 cursor-pointer transition-colors text-[14px] font-medium text-slate-800"
                >
                  <div className="font-bold text-slate-900 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{it.item_name}</span>
                      {statusChip(it)}
                    </div>
                  </div>
                  <div className="tx-num text-right text-slate-500">{it.opening}</div>
                  <div className="tx-num text-right text-sky-700 font-bold">{it.purchased > 0 ? `+${it.purchased}` : '0'}</div>
                  <div className="tx-num text-right text-emerald-700 font-bold">{it.produced > 0 ? `+${it.produced}` : '0'}</div>
                  <div className="tx-num text-right text-amber-700 font-bold">{it.sold > 0 ? `-${it.sold}` : '0'}</div>
                  <div className="tx-num text-right text-orange-700 font-bold">{inPolish > 0 ? `-${inPolish}` : '0'}</div>
                  <div className="tx-num text-right text-indigo-700 font-bold">{it.returned > 0 ? `+${it.returned}` : '0'}</div>
                  <div className="tx-num text-right font-extrabold text-emerald-700">{it.in_hand_balance}</div>
                  <div className="tx-num text-right font-black text-slate-900">{it.closing_balance}</div>
                  <div className="text-center">
                    <span className="inline-flex items-center gap-0.5 text-xs font-bold text-brand-900 bg-brand-50 px-2 py-1 rounded-lg">
                      Ledger <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>

                {/* Narrow Card (< 860px container) */}
                <div
                  onClick={() => handleOpenLedger(it.item_name)}
                  className="stock-mobile-card p-3.5 space-y-2.5 hover:bg-amber-50/40 cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[15px] font-bold text-slate-900 truncate">{it.item_name}</span>
                      {statusChip(it)}
                    </div>
                    <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-brand-900 bg-brand-50 px-2.5 py-1 rounded-lg">
                      Ledger <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div><span className="text-slate-400 block">Opening</span><b className="tx-num text-slate-700">{it.opening}</b></div>
                    <div><span className="text-slate-400 block">Purchased</span><b className="tx-num text-sky-700">+{it.purchased}</b></div>
                    <div><span className="text-slate-400 block">Produced</span><b className="tx-num text-emerald-700">+{it.produced}</b></div>
                    <div><span className="text-slate-400 block">Sold</span><b className="tx-num text-amber-700">-{it.sold}</b></div>
                    <div><span className="text-slate-400 block">In Polish</span><b className="tx-num text-orange-700">-{inPolish}</b></div>
                    <div><span className="text-slate-400 block">Returned</span><b className="tx-num text-indigo-700">+{it.returned}</b></div>
                    <div><span className="text-slate-400 block">In-Hand</span><b className="tx-num text-emerald-700">{it.in_hand_balance}</b></div>
                    <div><span className="text-slate-400 block">Closing</span><b className="tx-num text-slate-900">{it.closing_balance}</b></div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Item Ledger Modal Sheet */}
      {selectedItem && (
        <ItemLedgerSheet
          itemName={selectedItem}
          rows={ledgerRows}
          includeVoided={includeVoided}
          onToggleVoided={v => {
            setIncludeVoided(v);
            loadLedger(selectedItem, v);
          }}
          onRefresh={() => {
            loadLedger(selectedItem, includeVoided);
            onRefresh();
          }}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {/* Manual Stock Entry Modal (Opening / Production / Adjustment) */}
      {openingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-1">Add Stock Movement</h3>
            <p className="text-xs text-slate-500 mb-4">Record opening stock, manual production received, or a count adjustment (+/-).</p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handleSaveOpening} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Entry Type</label>
                  <select
                    value={openingForm.movement_type}
                    onChange={e => setOpeningForm({ ...openingForm, movement_type: e.target.value as any })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm bg-white focus:border-brand-700 focus:outline-none"
                  >
                    <option value="OPENING">Opening stock</option>
                    <option value="PRODUCTION">Production received</option>
                    <option value="ADJUSTMENT">Adjustment (+/-)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Date</label>
                  <input
                    type="date"
                    value={openingForm.date}
                    onChange={e => setOpeningForm({ ...openingForm, date: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  />
                </div>
              </div>

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
                    min={openingForm.movement_type === 'ADJUSTMENT' ? undefined : 1}
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
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Notes / Reason</label>
                <textarea
                  rows={2}
                  placeholder="Reason or reference"
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
                  {busy ? 'Saving...' : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Item Merge Modal */}
      {mergeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-1">Merge Duplicate Items</h3>
            <p className="text-xs text-slate-500 mb-4">
              Combine a duplicate item name into a canonical target item across all stock movements, bills, and polishing entries. Totals remain unchanged.
            </p>
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {error}
              </div>
            )}
            <form onSubmit={handleMergeItems} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Duplicate (source) item</label>
                <select
                  required
                  value={mergeSource}
                  onChange={e => setMergeSource(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm bg-white focus:border-indigo-600 focus:outline-none"
                >
                  <option value="">-- Select source item --</option>
                  {items.map(it => (
                    <option key={it.item_name} value={it.item_name}>
                      {it.item_name} (Stock: {it.closing_balance})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Merge into (target) item</label>
                <select
                  required
                  value={mergeTarget}
                  onChange={e => setMergeTarget(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm bg-white focus:border-indigo-600 focus:outline-none"
                >
                  <option value="">-- Select target item --</option>
                  {items.filter(it => it.item_name !== mergeSource).map(it => (
                    <option key={it.item_name} value={it.item_name}>
                      {it.item_name} (Stock: {it.closing_balance})
                    </option>
                  ))}
                </select>
              </div>
              {mergeSource && mergeTarget && (
                <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-3 text-xs text-indigo-900">
                  All records for <b>{mergeSource}</b> will be moved into <b>{mergeTarget}</b>. Combined closing balance:{' '}
                  <b>
                    {(items.find(i => i.item_name === mergeSource)?.closing_balance ?? 0) +
                      (items.find(i => i.item_name === mergeTarget)?.closing_balance ?? 0)}
                  </b>.
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMergeOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-bold shadow-md disabled:opacity-50"
                >
                  {busy ? 'Merging...' : 'Confirm Merge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
