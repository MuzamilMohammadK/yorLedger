import React, { useState } from 'react';
import { Plus, Scissors, Phone, MapPin, Layers, Scale, DollarSign, Edit3, CheckCircle2, ChevronRight, X, AlertCircle } from 'lucide-react';
import { WeaverAccountSummary, OwnLoomRegister, RawMaterialSummary, LoomType, WeaverTxType, formatPaiseToINR } from '@yorbalance/shared';
import { api } from '../../lib/api';
import { todayIST } from '../../lib/data/util';

interface Props {
  weavers: WeaverAccountSummary[];
  ownLooms: OwnLoomRegister | null;
  rawMaterials: RawMaterialSummary[];
  onRefresh: () => void;
}

export const WeaversLoomsView: React.FC<Props> = ({ weavers, ownLooms, rawMaterials, onRefresh }) => {
  const [activeModal, setActiveModal] = useState<
    'NONE' | 'ADD_WEAVER' | 'EDIT_LOOMS' | 'ISSUE_MATERIAL' | 'RECEIVE_SAREES' | 'PAY_WAGES' | 'VIEW_ACCOUNT'
  >('NONE');
  const [selectedWeaver, setSelectedWeaver] = useState<WeaverAccountSummary | null>(null);

  // Forms
  const [weaverForm, setWeaverForm] = useState<{
    name: string;
    phone: string;
    address: string;
    type: LoomType;
    looms_count: string;
    notes: string;
  }>({
    name: '',
    phone: '',
    address: '',
    type: 'HANDLOOM',
    looms_count: '1',
    notes: ''
  });

  const [loomForm, setLoomForm] = useState({
    handloom_running: ownLooms ? String(ownLooms.handloom_running) : '0',
    handloom_idle: ownLooms ? String(ownLooms.handloom_idle) : '0',
    handloom_repair: ownLooms ? String(ownLooms.handloom_repair) : '0',
    powerloom_running: ownLooms ? String(ownLooms.powerloom_running) : '0',
    powerloom_idle: ownLooms ? String(ownLooms.powerloom_idle) : '0',
    powerloom_repair: ownLooms ? String(ownLooms.powerloom_repair) : '0'
  });

  const [issueForm, setIssueForm] = useState({
    weaver_id: '',
    material_id: '',
    qty_kg: '',
    unit_price: '',
    date: todayIST(),
    notes: ''
  });

  const [receiveForm, setReceiveForm] = useState({
    weaver_id: '',
    finished_item_name: 'Pure Silk Saree',
    sarees_count: '',
    wastage_kg: '0',
    wage_amount: '',
    date: todayIST(),
    notes: ''
  });

  const [wagePayForm, setWagePayForm] = useState<{
    weaver_id: string;
    amount: string;
    payment_mode: 'CASH' | 'CHEQUE' | 'NEFT' | 'UPI';
    date: string;
    notes: string;
  }>({
    weaver_id: '',
    amount: '',
    payment_mode: 'CASH',
    date: todayIST(),
    notes: ''
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalWeavers = weavers.length;
  const totalLoomsOperated = weavers.reduce((sum, w) => sum + w.weaver.looms_count, 0);
  const totalPendingYarnKg = weavers.reduce((sum, w) => sum + w.pending_material_kg, 0);
  const totalWagesDuePaise = weavers.reduce((sum, w) => sum + w.wages_due_paise, 0);

  // Own loom totals
  const totalOwnHandlooms = (ownLooms?.handloom_running ?? 0) + (ownLooms?.handloom_idle ?? 0) + (ownLooms?.handloom_repair ?? 0);
  const totalOwnPowerlooms = (ownLooms?.powerloom_running ?? 0) + (ownLooms?.powerloom_idle ?? 0) + (ownLooms?.powerloom_repair ?? 0);

  const handleSaveWeaver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!weaverForm.name.trim() || !weaverForm.phone.trim()) {
      setError('Please provide weaver name and contact number');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createWeaver({
        name: weaverForm.name.trim(),
        phone: weaverForm.phone.trim(),
        address: weaverForm.address.trim(),
        type: weaverForm.type,
        looms_count: parseInt(weaverForm.looms_count, 10) || 1,
        notes: weaverForm.notes.trim() || null
      });
      setActiveModal('NONE');
      setWeaverForm({ name: '', phone: '', address: '', type: 'HANDLOOM', looms_count: '1', notes: '' });
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to save weaver');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveLooms = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.updateOwnLooms({
        handloom_running: parseInt(loomForm.handloom_running, 10) || 0,
        handloom_idle: parseInt(loomForm.handloom_idle, 10) || 0,
        handloom_repair: parseInt(loomForm.handloom_repair, 10) || 0,
        powerloom_running: parseInt(loomForm.powerloom_running, 10) || 0,
        powerloom_idle: parseInt(loomForm.powerloom_idle, 10) || 0,
        powerloom_repair: parseInt(loomForm.powerloom_repair, 10) || 0
      });
      setActiveModal('NONE');
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to update loom register');
    } finally {
      setBusy(false);
    }
  };

  const handleIssueMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueForm.weaver_id || !issueForm.material_id || !issueForm.qty_kg) {
      setError('Please select weaver, raw material, and quantity');
      return;
    }
    const qty = parseFloat(issueForm.qty_kg);
    if (!(qty > 0)) {
      setError('Quantity must be greater than zero');
      return;
    }
    const mat = rawMaterials.find(m => m.material.id === issueForm.material_id);
    const unitPricePaise = issueForm.unit_price ? Math.round(parseFloat(issueForm.unit_price) * 100) : (mat?.material.unit_price_paise ?? 0);

    setBusy(true);
    setError(null);
    try {
      await api.recordWeaverTx({
        weaver_id: issueForm.weaver_id,
        action_type: 'ISSUE',
        material_id: issueForm.material_id,
        qty_kg: qty,
        unit_price_paise: unitPricePaise,
        date: issueForm.date,
        notes: issueForm.notes.trim() || null
      });
      setActiveModal('NONE');
      setIssueForm({ weaver_id: '', material_id: '', qty_kg: '', unit_price: '', date: todayIST(), notes: '' });
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to issue material');
    } finally {
      setBusy(false);
    }
  };

  const handleReceiveSarees = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveForm.weaver_id || !receiveForm.sarees_count) {
      setError('Please select weaver and enter sarees count');
      return;
    }
    const count = parseInt(receiveForm.sarees_count, 10);
    if (!(count > 0)) {
      setError('Sarees count must be greater than zero');
      return;
    }
    const wagePaise = receiveForm.wage_amount ? Math.round(parseFloat(receiveForm.wage_amount) * 100) : 0;
    const wastage = parseFloat(receiveForm.wastage_kg) || 0;

    setBusy(true);
    setError(null);
    try {
      await api.recordWeaverTx({
        weaver_id: receiveForm.weaver_id,
        action_type: 'RECEIVE',
        finished_item_name: receiveForm.finished_item_name.trim(),
        sarees_count: count,
        wastage_kg: wastage,
        wage_amount_paise: wagePaise,
        date: receiveForm.date,
        notes: receiveForm.notes.trim() || null
      });
      setActiveModal('NONE');
      setReceiveForm({
        weaver_id: '',
        finished_item_name: 'Pure Silk Saree',
        sarees_count: '',
        wastage_kg: '0',
        wage_amount: '',
        date: todayIST(),
        notes: ''
      });
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to record received sarees');
    } finally {
      setBusy(false);
    }
  };

  const handlePayWages = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wagePayForm.weaver_id || !wagePayForm.amount) {
      setError('Please select weaver and enter payment amount');
      return;
    }
    const amountPaise = Math.round(parseFloat(wagePayForm.amount) * 100);
    if (!(amountPaise > 0)) {
      setError('Amount must be greater than zero');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.recordWeaverTx({
        weaver_id: wagePayForm.weaver_id,
        action_type: 'WAGE_PAYMENT',
        payment_amount_paise: amountPaise,
        payment_mode: wagePayForm.payment_mode,
        date: wagePayForm.date,
        notes: wagePayForm.notes.trim() || null
      });
      setActiveModal('NONE');
      setWagePayForm({ weaver_id: '', amount: '', payment_mode: 'CASH', date: todayIST(), notes: '' });
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to record wage payment');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Own Loom Register Card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl p-5 sm:p-6 shadow-md border border-slate-700">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <span className="text-amber-400 text-xs font-bold uppercase tracking-wider block">Own Loom Register</span>
            <h3 className="text-xl font-bold text-white mt-1">In-House Manufacturing Capacity</h3>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoomForm({
                handloom_running: String(ownLooms?.handloom_running ?? 0),
                handloom_idle: String(ownLooms?.handloom_idle ?? 0),
                handloom_repair: String(ownLooms?.handloom_repair ?? 0),
                powerloom_running: String(ownLooms?.powerloom_running ?? 0),
                powerloom_idle: String(ownLooms?.powerloom_idle ?? 0),
                powerloom_repair: String(ownLooms?.powerloom_repair ?? 0)
              });
              setActiveModal('EDIT_LOOMS');
            }}
            className="h-10 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-2 transition-colors self-start sm:self-auto"
          >
            <Edit3 className="w-4 h-4" />
            <span>Update Looms Register</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {/* Handlooms */}
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-amber-300">Own Handlooms</span>
              <span className="text-xs bg-amber-400/20 text-amber-300 px-2.5 py-0.5 rounded-full font-bold">
                {totalOwnHandlooms} Total
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-white/5 p-2 rounded-xl">
                <span className="text-slate-400 block mb-1">Running</span>
                <span className="text-base font-bold text-emerald-400">{ownLooms?.handloom_running ?? 0}</span>
              </div>
              <div className="bg-white/5 p-2 rounded-xl">
                <span className="text-slate-400 block mb-1">Idle</span>
                <span className="text-base font-bold text-amber-400">{ownLooms?.handloom_idle ?? 0}</span>
              </div>
              <div className="bg-white/5 p-2 rounded-xl">
                <span className="text-slate-400 block mb-1">Repair</span>
                <span className="text-base font-bold text-rose-400">{ownLooms?.handloom_repair ?? 0}</span>
              </div>
            </div>
          </div>

          {/* Powerlooms */}
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-sky-300">Own Powerlooms</span>
              <span className="text-xs bg-sky-400/20 text-sky-300 px-2.5 py-0.5 rounded-full font-bold">
                {totalOwnPowerlooms} Total
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-white/5 p-2 rounded-xl">
                <span className="text-slate-400 block mb-1">Running</span>
                <span className="text-base font-bold text-emerald-400">{ownLooms?.powerloom_running ?? 0}</span>
              </div>
              <div className="bg-white/5 p-2 rounded-xl">
                <span className="text-slate-400 block mb-1">Idle</span>
                <span className="text-base font-bold text-amber-400">{ownLooms?.powerloom_idle ?? 0}</span>
              </div>
              <div className="bg-white/5 p-2 rounded-xl">
                <span className="text-slate-400 block mb-1">Repair</span>
                <span className="text-base font-bold text-rose-400">{ownLooms?.powerloom_repair ?? 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Associated Weavers</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">{totalWeavers}</span>
            <span className="text-xs font-medium text-slate-500">{totalLoomsOperated} looms total</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Pending Yarn with Weavers</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-amber-600">{totalPendingYarnKg.toFixed(2)}</span>
            <span className="text-xs font-medium text-slate-500">kg unreturned</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Weaver Wages Due</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl sm:text-2xl font-extrabold text-rose-600">{formatPaiseToINR(totalWagesDuePaise)}</span>
            <span className="text-xs font-medium text-slate-500">unpaid balance</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Finished Sarees Received</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-600">
              {weavers.reduce((sum, w) => sum + w.sarees_received, 0)}
            </span>
            <span className="text-xs font-medium text-slate-500">from all weavers</span>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <h4 className="text-base font-bold text-slate-900">Weaver Accounts & Register</h4>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveModal('ISSUE_MATERIAL')}
            className="h-10 px-3.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Scale className="w-4 h-4 text-amber-600" />
            <span>Issue Yarn</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModal('RECEIVE_SAREES')}
            className="h-10 px-3.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Receive Sarees</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModal('PAY_WAGES')}
            className="h-10 px-3.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <DollarSign className="w-4 h-4 text-rose-600" />
            <span>Pay Wages</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModal('ADD_WEAVER')}
            className="h-10 px-4 rounded-xl bg-brand-900 hover:bg-brand-950 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Weaver</span>
          </button>
        </div>
      </div>

      {/* Weavers Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3.5 px-4">Weaver Name</th>
                <th className="py-3.5 px-3">Loom Info</th>
                <th className="py-3.5 px-3 text-right">Yarn Issued (kg)</th>
                <th className="py-3.5 px-3 text-right">Sarees Produced</th>
                <th className="py-3.5 px-3 text-right">Pending Yarn</th>
                <th className="py-3.5 px-3 text-right">Wages Due</th>
                <th className="py-3.5 px-4 text-center">Account</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {weavers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Scissors className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-base font-semibold">No weavers registered yet.</p>
                    <p className="text-xs">Click "Add Weaver" to track raw material issues and finished saree receipts.</p>
                  </td>
                </tr>
              ) : (
                weavers.map(w => (
                  <tr key={w.weaver.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div>
                        <span className="font-bold text-slate-900 block">{w.weaver.name}</span>
                        <span className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" /> {w.weaver.phone}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {w.weaver.type} &middot; {w.weaver.looms_count} {w.weaver.looms_count === 1 ? 'loom' : 'looms'}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono text-slate-700">
                      {w.material_issued_kg.toFixed(2)} kg
                    </td>
                    <td className="py-3.5 px-3 text-right font-bold text-emerald-700 font-mono">
                      {w.sarees_received}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-bold text-amber-700">
                      {w.pending_material_kg.toFixed(2)} kg
                    </td>
                    <td className="py-3.5 px-3 text-right font-extrabold text-rose-600 font-mono">
                      {formatPaiseToINR(w.wages_due_paise)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedWeaver(w);
                          setActiveModal('VIEW_ACCOUNT');
                        }}
                        className="inline-flex items-center gap-1 text-xs font-bold text-brand-900 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-xl transition-colors"
                      >
                        Details <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Weaver Modal */}
      {activeModal === 'ADD_WEAVER' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-1">Add Weaver Master</h3>
            <p className="text-xs text-slate-500 mb-4">Register an artisan weaver who runs handlooms or powerlooms.</p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handleSaveWeaver} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Weaver Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramu Weaver"
                  value={weaverForm.name}
                  onChange={e => setWeaverForm({ ...weaverForm, name: e.target.value })}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Phone Number</label>
                <input
                  type="tel"
                  required
                  placeholder="10-digit mobile"
                  value={weaverForm.phone}
                  onChange={e => setWeaverForm({ ...weaverForm, phone: e.target.value })}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Loom Type</label>
                  <select
                    value={weaverForm.type}
                    onChange={e => setWeaverForm({ ...weaverForm, type: e.target.value as LoomType })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  >
                    <option value="HANDLOOM">Handloom</option>
                    <option value="POWERLOOM">Powerloom</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Looms Count</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={weaverForm.looms_count}
                    onChange={e => setWeaverForm({ ...weaverForm, looms_count: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Address / Village</label>
                <input
                  type="text"
                  placeholder="Optional address"
                  value={weaverForm.address}
                  onChange={e => setWeaverForm({ ...weaverForm, address: e.target.value })}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Specialization (e.g. zari borders, pure silk jacquard)"
                  value={weaverForm.notes}
                  onChange={e => setWeaverForm({ ...weaverForm, notes: e.target.value })}
                  className="w-full p-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal('NONE')}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-950 text-white text-sm font-bold shadow-md transition-colors disabled:opacity-50"
                >
                  {busy ? 'Saving...' : 'Register Weaver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Own Looms Modal */}
      {activeModal === 'EDIT_LOOMS' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-1">Update Own Loom Register</h3>
            <p className="text-xs text-slate-500 mb-4">Maintain counts of owned handlooms and powerlooms by status.</p>

            <form onSubmit={handleSaveLooms} className="space-y-4">
              <div className="border border-amber-200 bg-amber-50/50 p-4 rounded-2xl space-y-3">
                <span className="text-xs font-bold text-amber-900 uppercase block">Own Handlooms</span>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Running</label>
                    <input
                      type="number"
                      min="0"
                      value={loomForm.handloom_running}
                      onChange={e => setLoomForm({ ...loomForm, handloom_running: e.target.value })}
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Idle</label>
                    <input
                      type="number"
                      min="0"
                      value={loomForm.handloom_idle}
                      onChange={e => setLoomForm({ ...loomForm, handloom_idle: e.target.value })}
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Under Repair</label>
                    <input
                      type="number"
                      min="0"
                      value={loomForm.handloom_repair}
                      onChange={e => setLoomForm({ ...loomForm, handloom_repair: e.target.value })}
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="border border-sky-200 bg-sky-50/50 p-4 rounded-2xl space-y-3">
                <span className="text-xs font-bold text-sky-900 uppercase block">Own Powerlooms</span>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Running</label>
                    <input
                      type="number"
                      min="0"
                      value={loomForm.powerloom_running}
                      onChange={e => setLoomForm({ ...loomForm, powerloom_running: e.target.value })}
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Idle</label>
                    <input
                      type="number"
                      min="0"
                      value={loomForm.powerloom_idle}
                      onChange={e => setLoomForm({ ...loomForm, powerloom_idle: e.target.value })}
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Under Repair</label>
                    <input
                      type="number"
                      min="0"
                      value={loomForm.powerloom_repair}
                      onChange={e => setLoomForm({ ...loomForm, powerloom_repair: e.target.value })}
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal('NONE')}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-950 text-white text-sm font-bold shadow-md transition-colors disabled:opacity-50"
                >
                  {busy ? 'Saving...' : 'Update Register'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Issue Material Modal */}
      {activeModal === 'ISSUE_MATERIAL' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-1">Issue Raw Material to Weaver</h3>
            <p className="text-xs text-slate-500 mb-4">Record yarn or zari issued for production.</p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handleIssueMaterial} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Weaver</label>
                  <select
                    required
                    value={issueForm.weaver_id}
                    onChange={e => setIssueForm({ ...issueForm, weaver_id: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  >
                    <option value="">Select Weaver...</option>
                    {weavers.map(w => (
                      <option key={w.weaver.id} value={w.weaver.id}>
                        {w.weaver.name} ({w.weaver.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Issue Date</label>
                  <input
                    type="date"
                    required
                    value={issueForm.date}
                    onChange={e => setIssueForm({ ...issueForm, date: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Raw Material</label>
                <select
                  required
                  value={issueForm.material_id}
                  onChange={e => setIssueForm({ ...issueForm, material_id: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                >
                  <option value="">Select Material...</option>
                  {rawMaterials.map(m => (
                    <option key={m.material.id} value={m.material.id}>
                      {m.material.name} (In Hand: {m.balance_kg.toFixed(2)} kg)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Quantity Issued (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="e.g. 5.5"
                    value={issueForm.qty_kg}
                    onChange={e => setIssueForm({ ...issueForm, qty_kg: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Rate (₹/kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Auto rate"
                    value={issueForm.unit_price}
                    onChange={e => setIssueForm({ ...issueForm, unit_price: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Design pattern or warp/weft specifics"
                  value={issueForm.notes}
                  onChange={e => setIssueForm({ ...issueForm, notes: e.target.value })}
                  className="w-full p-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal('NONE')}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-950 text-white text-sm font-bold shadow-md transition-colors disabled:opacity-50"
                >
                  {busy ? 'Saving...' : 'Issue Material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive Finished Sarees Modal */}
      {activeModal === 'RECEIVE_SAREES' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-1">Receive Sarees from Weaver</h3>
            <p className="text-xs text-slate-500 mb-4">Received sarees are automatically added to finished goods stock.</p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handleReceiveSarees} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Weaver</label>
                  <select
                    required
                    value={receiveForm.weaver_id}
                    onChange={e => setReceiveForm({ ...receiveForm, weaver_id: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  >
                    <option value="">Select Weaver...</option>
                    {weavers.map(w => (
                      <option key={w.weaver.id} value={w.weaver.id}>
                        {w.weaver.name} (Pending: {w.pending_material_kg.toFixed(2)} kg)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Receipt Date</label>
                  <input
                    type="date"
                    required
                    value={receiveForm.date}
                    onChange={e => setReceiveForm({ ...receiveForm, date: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Finished Saree Item Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kanchipuram Silk Saree"
                  value={receiveForm.finished_item_name}
                  onChange={e => setReceiveForm({ ...receiveForm, finished_item_name: e.target.value })}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Sarees Count</label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="Count"
                    value={receiveForm.sarees_count}
                    onChange={e => setReceiveForm({ ...receiveForm, sarees_count: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm font-bold focus:border-brand-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Wastage (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="kg"
                    value={receiveForm.wastage_kg}
                    onChange={e => setReceiveForm({ ...receiveForm, wastage_kg: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Wage Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Total wage"
                    value={receiveForm.wage_amount}
                    onChange={e => setReceiveForm({ ...receiveForm, wage_amount: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Batch or inspection quality notes"
                  value={receiveForm.notes}
                  onChange={e => setReceiveForm({ ...receiveForm, notes: e.target.value })}
                  className="w-full p-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal('NONE')}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-950 text-white text-sm font-bold shadow-md transition-colors disabled:opacity-50"
                >
                  {busy ? 'Saving...' : 'Receive & Add to Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pay Wages Modal */}
      {activeModal === 'PAY_WAGES' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-1">Pay Weaver Wages</h3>
            <p className="text-xs text-slate-500 mb-4">Record payments made towards weaving wages.</p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handlePayWages} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Weaver</label>
                <select
                  required
                  value={wagePayForm.weaver_id}
                  onChange={e => setWagePayForm({ ...wagePayForm, weaver_id: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                >
                  <option value="">Select Weaver...</option>
                  {weavers.map(w => (
                    <option key={w.weaver.id} value={w.weaver.id}>
                      {w.weaver.name} (Due: {formatPaiseToINR(w.wages_due_paise)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="₹ Paid"
                    value={wagePayForm.amount}
                    onChange={e => setWagePayForm({ ...wagePayForm, amount: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm font-bold focus:border-brand-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Payment Mode</label>
                  <select
                    value={wagePayForm.payment_mode}
                    onChange={e => setWagePayForm({ ...wagePayForm, payment_mode: e.target.value as any })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="NEFT">Bank Transfer</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Payment Date</label>
                <input
                  type="date"
                  required
                  value={wagePayForm.date}
                  onChange={e => setWagePayForm({ ...wagePayForm, date: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Receipt number or notes"
                  value={wagePayForm.notes}
                  onChange={e => setWagePayForm({ ...wagePayForm, notes: e.target.value })}
                  className="w-full p-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal('NONE')}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-950 text-white text-sm font-bold shadow-md transition-colors disabled:opacity-50"
                >
                  {busy ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Weaver Account View Modal */}
      {activeModal === 'VIEW_ACCOUNT' && selectedWeaver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-xl font-bold text-slate-900">{selectedWeaver.weaver.name}</h3>
                <p className="text-xs text-slate-500">Weaver Account & Production Summary</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal('NONE')}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 my-4">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <span className="text-xs text-slate-500 block">Total Material Issued</span>
                <span className="text-lg font-bold text-slate-900">{selectedWeaver.material_issued_kg.toFixed(2)} kg</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <span className="text-xs text-slate-500 block">Finished Sarees Received</span>
                <span className="text-lg font-bold text-emerald-600">{selectedWeaver.sarees_received}</span>
              </div>
              <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200">
                <span className="text-xs text-amber-800 block font-semibold">Pending Yarn with Weaver</span>
                <span className="text-lg font-black text-amber-900">{selectedWeaver.pending_material_kg.toFixed(2)} kg</span>
              </div>
              <div className="bg-rose-50 p-3 rounded-2xl border border-rose-200">
                <span className="text-xs text-rose-800 block font-semibold">Wages Due</span>
                <span className="text-lg font-black text-rose-700">{formatPaiseToINR(selectedWeaver.wages_due_paise)}</span>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl text-xs space-y-1.5 text-slate-600">
              <div className="flex justify-between">
                <span>Total Wages Earned:</span>
                <span className="font-bold text-slate-900">{formatPaiseToINR(selectedWeaver.wages_earned_paise)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Wages Paid:</span>
                <span className="font-bold text-slate-900">{formatPaiseToINR(selectedWeaver.wages_paid_paise)}</span>
              </div>
              <div className="flex justify-between">
                <span>Material Returned / Wastage:</span>
                <span className="font-bold text-slate-900">{(selectedWeaver.material_returned_kg + selectedWeaver.wastage_kg).toFixed(2)} kg</span>
              </div>
              <div className="flex justify-between">
                <span>Contact Phone:</span>
                <span className="font-bold text-slate-900">{selectedWeaver.weaver.phone}</span>
              </div>
              {selectedWeaver.weaver.address && (
                <div className="flex justify-between">
                  <span>Address:</span>
                  <span className="font-medium text-slate-900">{selectedWeaver.weaver.address}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="button"
                onClick={() => setActiveModal('NONE')}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
