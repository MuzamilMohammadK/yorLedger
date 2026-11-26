import React, { useState } from 'react';
import { formatPaiseToINR } from '@yorbalance/shared';
import { api } from '../../lib/api';
import { todayIST } from '../../lib/data/util';
import { PartyOption } from './TallyFilters';

interface Props {
  parties: PartyOption[];
  defaultHsn?: string;
  onSuccess: () => void;
}

export const PolishForm: React.FC<Props> = ({ parties, defaultHsn, onSuccess }) => {
  const [date, setDate] = useState(todayIST());
  const [partyId, setPartyId] = useState('');
  const [customPerson, setCustomPerson] = useState('');
  const [hsnCode, setHsnCode] = useState(defaultHsn ?? '');
  const [itemName, setItemName] = useState('Pure Silk Saree');
  const [qty, setQty] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [createBill, setCreateBill] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qtyNum = Math.max(0, parseInt(qty, 10) || 0);
  const unitPricePaise = Math.max(0, Math.round((parseFloat(unitPrice) || 0) * 100));
  const totalPaise = qtyNum * unitPricePaise;
  const selectedParty = parties.find(p => p.id === partyId);
  const personName = selectedParty?.name ?? customPerson.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personName) {
      setError('Select or enter a polisher name');
      return;
    }
    if (qtyNum <= 0) {
      setError('Number of sarees must be greater than zero');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.givePolish({
        date,
        party_id: selectedParty?.id ?? null,
        person_name: personName,
        item_name: itemName.trim() || 'Silk Saree',
        hsn_code: hsnCode.trim() || null,
        qty: qtyNum,
        unit_price_paise: unitPricePaise,
        create_job_work_bill: Boolean(createBill && selectedParty?.id)
      });
      setQty('');
      setUnitPrice('');
      setCreateBill(false);
      onSuccess();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save polishing entry');
    } finally {
      setBusy(false);
    }
  };

  const inputCls = 'mt-1 w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:border-indigo-600 focus:outline-none';

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-slate-900">Give sarees to polish</h4>
        <span className="text-xs font-bold text-indigo-700 tabular-nums">
          Total: {formatPaiseToINR(totalPaise, true)}
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 items-end">
        <label className="text-xs font-semibold text-slate-700">
          Date
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
        </label>

        <label className="text-xs font-semibold text-slate-700">
          Polisher (party)
          <select value={partyId} onChange={e => setPartyId(e.target.value)} className={inputCls}>
            <option value="">Type custom name...</option>
            {parties.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>

        {!partyId && (
          <label className="text-xs font-semibold text-slate-700">
            Polisher name
            <input
              type="text"
              value={customPerson}
              onChange={e => setCustomPerson(e.target.value)}
              placeholder="e.g. Raju Polisher"
              className={inputCls}
            />
          </label>
        )}

        <label className="text-xs font-semibold text-slate-700">
          HSN / Item
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            <input
              type="text"
              value={hsnCode}
              onChange={e => setHsnCode(e.target.value.replace(/[^\d]/g, '').slice(0, 8))}
              placeholder="HSN"
              className="h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs font-mono"
            />
            <input
              type="text"
              value={itemName}
              onChange={e => setItemName(e.target.value)}
              placeholder="Item"
              className="h-10 px-2.5 rounded-xl border border-slate-300 bg-white text-xs"
            />
          </div>
        </label>

        <label className="text-xs font-semibold text-slate-700">
          No. of sarees
          <input
            type="number"
            min={1}
            value={qty}
            onChange={e => setQty(e.target.value)}
            placeholder="0"
            className={inputCls}
          />
        </label>

        <label className="text-xs font-semibold text-slate-700">
          Unit price (₹)
          <input
            type="number"
            min={0}
            step="0.01"
            value={unitPrice}
            onChange={e => setUnitPrice(e.target.value)}
            placeholder="0.00"
            className={inputCls}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <label className={`inline-flex items-center gap-2 text-xs ${selectedParty ? 'text-slate-700' : 'text-slate-400'}`}>
          <input
            type="checkbox"
            checked={createBill}
            disabled={!selectedParty}
            onChange={e => setCreateBill(e.target.checked)}
            className="rounded border-slate-300 text-indigo-700"
          />
          <span>Create job-work bill so amount appears in Dues</span>
        </label>

        <button
          type="submit"
          disabled={busy}
          className="h-10 px-4 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-bold disabled:opacity-60"
        >
          {busy ? 'Saving...' : 'Give to polish'}
        </button>
      </div>
    </form>
  );
};
