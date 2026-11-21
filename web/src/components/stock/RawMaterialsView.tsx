import React, { useState } from 'react';
import { Plus, Scale, ArrowDownLeft, ArrowUpRight, AlertTriangle, Layers, Calendar, User, Search, RefreshCw } from 'lucide-react';
import { RawMaterialSummary, Weaver, formatPaiseToINR, RawMaterialTxType } from '@yorbalance/shared';
import { api } from '../../lib/api';
import { todayIST } from '../../lib/data/util';

interface Props {
  materials: RawMaterialSummary[];
  weavers: Weaver[];
  onRefresh: () => void;
}

export const RawMaterialsView: React.FC<Props> = ({ materials, weavers, onRefresh }) => {
  const [search, setSearch] = useState('');
  const [addMaterialOpen, setAddMaterialOpen] = useState(false);
  const [recordTxOpen, setRecordTxOpen] = useState(false);
  const [materialForm, setMaterialForm] = useState({ name: '', unit_price: '', low_stock_threshold_kg: '5' });
  const [txForm, setTxForm] = useState<{
    material_id: string;
    tx_type: RawMaterialTxType;
    qty_kg: string;
    rate_per_kg: string;
    weaver_id: string;
    date: string;
    notes: string;
  }>({
    material_id: '',
    tx_type: 'PURCHASE',
    qty_kg: '',
    rate_per_kg: '',
    weaver_id: '',
    date: todayIST(),
    notes: ''
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalKg = materials.reduce((sum, m) => sum + m.balance_kg, 0);
  const totalValuationPaise = materials.reduce((sum, m) => sum + m.stock_value_paise, 0);
  const lowStockCount = materials.filter(m => m.balance_kg <= (m.material.low_stock_threshold_kg ?? 5)).length;

  const filtered = materials.filter(m =>
    m.material.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!materialForm.name.trim() || !materialForm.unit_price) {
      setError('Please provide material name and unit price per kg');
      return;
    }
    const unitPricePaise = Math.round(parseFloat(materialForm.unit_price) * 100);
    const threshold = parseFloat(materialForm.low_stock_threshold_kg) || 5;

    setBusy(true);
    setError(null);
    try {
      await api.createRawMaterial({
        name: materialForm.name.trim(),
        unit: 'kg',
        unit_price_paise: unitPricePaise,
        low_stock_threshold_kg: threshold
      });
      setAddMaterialOpen(false);
      setMaterialForm({ name: '', unit_price: '', low_stock_threshold_kg: '5' });
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to add raw material');
    } finally {
      setBusy(false);
    }
  };

  const handleRecordTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txForm.material_id || !txForm.qty_kg) {
      setError('Please select material and enter quantity in kg');
      return;
    }
    const qty = parseFloat(txForm.qty_kg);
    if (!(qty > 0)) {
      setError('Quantity must be greater than zero');
      return;
    }

    const mat = materials.find(m => m.material.id === txForm.material_id);
    const ratePaise = txForm.rate_per_kg
      ? Math.round(parseFloat(txForm.rate_per_kg) * 100)
      : (mat?.material.unit_price_paise ?? 0);

    setBusy(true);
    setError(null);
    try {
      await api.recordRawMaterialTx({
        material_id: txForm.material_id,
        tx_type: txForm.tx_type,
        qty_kg: qty,
        rate_per_kg_paise: ratePaise,
        weaver_id: txForm.weaver_id || null,
        date: txForm.date,
        notes: txForm.notes.trim() || null
      });
      setRecordTxOpen(false);
      setTxForm({
        material_id: '',
        tx_type: 'PURCHASE',
        qty_kg: '',
        rate_per_kg: '',
        weaver_id: '',
        date: todayIST(),
        notes: ''
      });
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to record transaction');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Raw Material Types</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">{materials.length}</span>
            <span className="text-xs font-medium text-slate-500">yarn, zari, etc.</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Raw Stock in Hand</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-brand-900">{totalKg.toFixed(2)}</span>
            <span className="text-xs font-medium text-slate-500">kg total</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Raw Material Value</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl sm:text-2xl font-extrabold text-slate-900">{formatPaiseToINR(totalValuationPaise)}</span>
            <span className="text-xs font-medium text-slate-500">kg &times; rate</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Low Stock Alert</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className={`text-2xl sm:text-3xl font-extrabold ${lowStockCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {lowStockCount}
            </span>
            <span className="text-xs font-medium text-slate-500">near reorder level</span>
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
            placeholder="Search raw material name..."
            className="w-full h-11 pl-11 pr-4 rounded-xl border border-slate-200 text-sm focus:border-brand-700 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRecordTxOpen(true)}
            className="h-11 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
          >
            <Scale className="w-4 h-4 text-brand-900" />
            <span>Record Movement</span>
          </button>

          <button
            type="button"
            onClick={() => setAddMaterialOpen(true)}
            className="h-11 px-4 rounded-xl bg-brand-900 hover:bg-brand-950 text-white text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Raw Material</span>
          </button>
        </div>
      </div>

      {/* Raw Materials Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3.5 px-4">Material Name</th>
                <th className="py-3.5 px-3 text-right">Unit Price (₹/kg)</th>
                <th className="py-3.5 px-3 text-right">Purchased (kg)</th>
                <th className="py-3.5 px-3 text-right">Issued to Weaver (kg)</th>
                <th className="py-3.5 px-3 text-right">Returned (kg)</th>
                <th className="py-3.5 px-3 text-right">Wastage (kg)</th>
                <th className="py-3.5 px-3 text-right">Current Balance</th>
                <th className="py-3.5 px-4 text-right">Stock Value (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Layers className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-base font-semibold">No raw materials added yet.</p>
                    <p className="text-xs">Click "Add Raw Material" to define silk yarn, zari, and other supplies.</p>
                  </td>
                </tr>
              ) : (
                filtered.map(m => {
                  const isLow = m.balance_kg <= (m.material.low_stock_threshold_kg ?? 5);
                  return (
                    <tr key={m.material.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <span>{m.material.name}</span>
                          {isLow && (
                            <span className="px-2 py-0.5 text-[10px] font-extrabold bg-rose-50 border border-rose-200 text-rose-600 rounded-md">
                              LOW
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-right text-slate-600 font-mono">
                        {formatPaiseToINR(m.material.unit_price_paise)}
                      </td>
                      <td className="py-3.5 px-3 text-right text-sky-700 font-bold font-mono">
                        +{m.purchased_kg.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-3 text-right text-amber-700 font-bold font-mono">
                        -{m.issued_kg.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-3 text-right text-indigo-700 font-mono">
                        {m.returned_kg > 0 ? `+${m.returned_kg.toFixed(2)}` : '0'}
                      </td>
                      <td className="py-3.5 px-3 text-right text-rose-600 font-mono">
                        {m.wastage_kg > 0 ? `-${m.wastage_kg.toFixed(2)}` : '0'}
                      </td>
                      <td className="py-3.5 px-3 text-right font-black text-slate-900 text-base font-mono">
                        {m.balance_kg.toFixed(2)} kg
                      </td>
                      <td className="py-3.5 px-4 text-right font-extrabold text-emerald-700 font-mono">
                        {formatPaiseToINR(m.stock_value_paise)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Raw Material Master Modal */}
      {addMaterialOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-1">Add Raw Material</h3>
            <p className="text-xs text-slate-500 mb-4">Add a raw yarn, zari, or material to your stock inventory.</p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateMaterial} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Material Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mulberry Silk Yarn 20/22, Silver Zari"
                  value={materialForm.name}
                  onChange={e => setMaterialForm({ ...materialForm, name: e.target.value })}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Unit Price (₹/kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Rate per kg"
                    value={materialForm.unit_price}
                    onChange={e => setMaterialForm({ ...materialForm, unit_price: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Low Stock Threshold (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 5"
                    value={materialForm.low_stock_threshold_kg}
                    onChange={e => setMaterialForm({ ...materialForm, low_stock_threshold_kg: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddMaterialOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-950 text-white text-sm font-bold shadow-md transition-colors disabled:opacity-50"
                >
                  {busy ? 'Saving...' : 'Add Material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Movement Modal */}
      {recordTxOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-1">Record Raw Material Movement</h3>
            <p className="text-xs text-slate-500 mb-4">Record purchases, weaver issues, returns, or wastage.</p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handleRecordTx} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Movement Type</label>
                  <select
                    value={txForm.tx_type}
                    onChange={e => setTxForm({ ...txForm, tx_type: e.target.value as RawMaterialTxType })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  >
                    <option value="PURCHASE">Purchase (+)</option>
                    <option value="ISSUE_WEAVER">Issue to Weaver (-)</option>
                    <option value="RETURN">Return (+)</option>
                    <option value="WASTAGE">Wastage (-)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={txForm.date}
                    onChange={e => setTxForm({ ...txForm, date: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Raw Material</label>
                <select
                  required
                  value={txForm.material_id}
                  onChange={e => setTxForm({ ...txForm, material_id: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                >
                  <option value="">Select Material...</option>
                  {materials.map(m => (
                    <option key={m.material.id} value={m.material.id}>
                      {m.material.name} (Balance: {m.balance_kg.toFixed(2)} kg)
                    </option>
                  ))}
                </select>
              </div>

              {(txForm.tx_type === 'ISSUE_WEAVER' || txForm.tx_type === 'RETURN') && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Weaver</label>
                  <select
                    value={txForm.weaver_id}
                    onChange={e => setTxForm({ ...txForm, weaver_id: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  >
                    <option value="">Select Weaver...</option>
                    {weavers.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.type} &middot; {w.looms_count} looms)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Quantity (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="e.g. 10.5"
                    value={txForm.qty_kg}
                    onChange={e => setTxForm({ ...txForm, qty_kg: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Rate (₹/kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Leave blank for master rate"
                    value={txForm.rate_per_kg}
                    onChange={e => setTxForm({ ...txForm, rate_per_kg: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Notes / Voucher Reference</label>
                <textarea
                  rows={2}
                  placeholder="Optional details or batch notes"
                  value={txForm.notes}
                  onChange={e => setTxForm({ ...txForm, notes: e.target.value })}
                  className="w-full p-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRecordTxOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-950 text-white text-sm font-bold shadow-md transition-colors disabled:opacity-50"
                >
                  {busy ? 'Saving...' : 'Record Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
