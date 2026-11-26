import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Trash2, IndianRupee, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import {
  AllocatedPolishEntry,
  PolisherAccountSummary,
  PolishingBatch,
  PolishingPersonSummary,
  formatPaiseToINR
} from '@yorbalance/shared';
import { api } from '../../lib/api';
import { todayIST } from '../../lib/data/util';
import { useI18n } from '../../i18n';

interface PolishPaymentRecord {
  id: string;
  person_name: string;
  party_id?: string | null;
  date: string;
  amount_paise: number;
  mode: string;
  is_advance: boolean;
  notes?: string | null;
  status: 'ACTIVE' | 'VOID';
}

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
  const [accountsData, setAccountsData] = useState<{
    entries: AllocatedPolishEntry[];
    accounts: PolisherAccountSummary[];
    payments: PolishPaymentRecord[];
  }>({ entries: [], accounts: [], payments: [] });

  const [search, setSearch] = useState('');
  const [personFilter, setPersonFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'RECEIVED'>('ALL');
  const [payFilter, setPayFilter] = useState<'ALL' | 'UNPAID' | 'PART' | 'PAID'>('ALL');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const [addBatchOpen, setAddBatchOpen] = useState(false);
  const [receiveEntry, setReceiveEntry] = useState<AllocatedPolishEntry | null>(null);
  const [payModal, setPayModal] = useState<{
    person_name: string;
    party_id?: string | null;
    item_name?: string;
    max_balance_paise: number;
    is_bulk?: boolean;
  } | null>(null);
  const [voidTarget, setVoidTarget] = useState<AllocatedPolishEntry | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const [sendForm, setSendForm] = useState({
    person_name: '',
    item_name: 'Pure Silk Saree',
    sarees_sent: '',
    unit_price: '',
    sent_date: todayIST(),
    notes: ''
  });
  const [receiveQty, setReceiveQty] = useState('');
  const [receiveDate, setReceiveDate] = useState(todayIST());

  const [payForm, setPayForm] = useState({
    amount: '',
    date: todayIST(),
    mode: 'CASH',
    notes: ''
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = async () => {
    try {
      const res = await api.getPolishingAccounts();
      setAccountsData({
        entries: res.entries,
        accounts: res.accounts,
        payments: (res.payments ?? []) as PolishPaymentRecord[]
      });
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadAccounts();
  }, [data.batches.length, data.totals.total_sarees_received]);

  const filteredEntries = useMemo(() => {
    return accountsData.entries.filter(e => {
      if (filter.from && e.sent_date < filter.from) return false;
      if (filter.to && e.sent_date > filter.to) return false;
      if (personFilter && e.person_name !== personFilter) return false;
      if (statusFilter === 'PENDING' && e.sarees_received >= e.sarees_sent) return false;
      if (statusFilter === 'RECEIVED' && e.sarees_received < e.sarees_sent) return false;
      if (payFilter !== 'ALL' && e.payment_status !== payFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const item = ((e as any).item_name ?? 'Silk Saree').toLowerCase();
        if (!e.person_name.toLowerCase().includes(q) && !item.includes(q)) return false;
      }
      return true;
    });
  }, [accountsData.entries, filter.from, filter.to, personFilter, statusFilter, payFilter, search]);

  const totalEntries = filteredEntries.length;
  const totalSent = filteredEntries.reduce((s, e) => s + e.sarees_sent, 0);
  const totalPending = filteredEntries.reduce((s, e) => s + Math.max(0, e.sarees_sent - e.sarees_received), 0);
  const totalCharges = accountsData.accounts.reduce((s, a) => s + a.total_charges_paise, 0);
  const totalPaid = accountsData.accounts.reduce((s, a) => s + a.total_paid_paise, 0);
  const totalOutstanding = totalCharges - totalPaid;

  const uniquePeople = Array.from(new Set(accountsData.entries.map(e => e.person_name))).sort();

  const selectedPersonAccount = useMemo(
    () => (personFilter ? accountsData.accounts.find(a => a.person_name === personFilter) ?? null : null),
    [accountsData.accounts, personFilter]
  );

  // Preview oldest-first allocation for the bulk Pay polisher dialog
  const bulkAllocationPreview = useMemo(() => {
    if (!payModal?.is_bulk) return [];
    const amtPaise = Math.round((parseFloat(payForm.amount) || 0) * 100);
    if (amtPaise <= 0) return [];
    let remaining = amtPaise;
    return accountsData.entries
      .filter(e => e.person_name === payModal.person_name && e.balance_paise > 0)
      .sort((a, b) => a.sent_date.localeCompare(b.sent_date))
      .map(e => {
        const alloc = Math.min(e.balance_paise, remaining);
        remaining -= alloc;
        return {
          id: e.id,
          sent_date: e.sent_date,
          item_name: (e as any).item_name ?? 'Silk Saree',
          balance_paise: e.balance_paise,
          allocated_paise: alloc
        };
      })
      .filter(r => r.allocated_paise > 0);
  }, [payModal, payForm.amount, accountsData.entries]);

  const handleSend = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const sent = parseInt(sendForm.sarees_sent, 10) || 0;
    const unit = Math.round((parseFloat(sendForm.unit_price) || 0) * 100);
    if (!sendForm.person_name.trim() || sent <= 0) {
      setError('Enter person name and sarees count > 0');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.givePolish({
        person_name: sendForm.person_name.trim(),
        item_name: sendForm.item_name.trim() || 'Silk Saree',
        qty: sent,
        unit_price_paise: unit,
        date: sendForm.sent_date,
        notes: sendForm.notes.trim() || null
      });
      setAddBatchOpen(false);
      setSendForm({ person_name: '', item_name: 'Pure Silk Saree', sarees_sent: '', unit_price: '', sent_date: todayIST(), notes: '' });
      await loadAccounts();
      onRefresh();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save polishing batch');
    } finally {
      setBusy(false);
    }
  };

  const handleReceive = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!receiveEntry) return;
    const q = parseInt(receiveQty, 10) || 0;
    const pending = Math.max(0, receiveEntry.sarees_sent - receiveEntry.sarees_received);
    if (q <= 0 || q > pending) {
      setError(`Received quantity must be between 1 and ${pending}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.receivePolish(receiveEntry.id, { receive_qty: q, received_date: receiveDate });
      setReceiveEntry(null);
      setReceiveQty('');
      await loadAccounts();
      onRefresh();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to record receive');
    } finally {
      setBusy(false);
    }
  };

  const handlePay = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!payModal) return;
    const today = todayIST();
    if (!payForm.date) { setError('Payment date is required'); return; }
    if (payForm.date > today) { setError('Payment date cannot be in the future'); return; }
    const amt = Math.round((parseFloat(payForm.amount) || 0) * 100);
    if (amt <= 0) { setError('Amount must be > 0'); return; }
    if (amt > Math.max(0, payModal.max_balance_paise)) {
      setError(`Payment cannot exceed balance due (${formatPaiseToINR(Math.max(0, payModal.max_balance_paise), true)})`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.recordPolishPayment({
        person_name: payModal.person_name,
        party_id: payModal.party_id ?? null,
        amount_paise: amt,
        date: payForm.date,
        mode: payForm.mode,
        is_advance: false,
        notes: payForm.notes.trim() || null
      });
      setPayModal(null);
      setPayForm({ amount: '', date: todayIST(), mode: 'CASH', notes: '' });
      await loadAccounts();
      onRefresh();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to record payment');
    } finally {
      setBusy(false);
    }
  };

  const confirmVoid = async () => {
    if (!voidTarget) return;
    if (voidTarget.paid_paise > 0) {
      setError('Cannot void: this entry has payments recorded.');
      return;
    }
    if (!voidReason.trim()) { setError('Void reason is required'); return; }
    setBusy(true);
    setError(null);
    try {
      await api.voidPolishingEntry(voidTarget.id, voidReason.trim());
      setVoidTarget(null);
      setVoidReason('');
      await loadAccounts();
      onRefresh();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to void');
    } finally {
      setBusy(false);
    }
  };

  const inputCls = 'mt-1 w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:border-indigo-600 focus:outline-none';

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-600 bg-white border border-slate-200 rounded-2xl px-4 py-2.5">
        <strong>What is this page for?</strong> Send sarees for polishing, record received quantities, and pay directly from each row (payments allocate oldest batch first).
      </p>

      {/* 6 KPI Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
          <span className="text-[11px] font-bold uppercase text-slate-500">Entries</span>
          <p className="mt-1 text-xl font-extrabold text-slate-900 tabular-nums">{totalEntries}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
          <span className="text-[11px] font-bold uppercase text-slate-500">Sarees sent</span>
          <p className="mt-1 text-xl font-extrabold text-slate-900 tabular-nums">{totalSent}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
          <span className="text-[11px] font-bold uppercase text-slate-500">Pending</span>
          <p className="mt-1 text-xl font-extrabold text-amber-700 tabular-nums">{totalPending}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
          <span className="text-[11px] font-bold uppercase text-slate-500">Total charges</span>
          <p className="mt-1 text-xl font-extrabold text-slate-900 tabular-nums">{formatPaiseToINR(totalCharges, true)}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
          <span className="text-[11px] font-bold uppercase text-slate-500">Paid</span>
          <p className="mt-1 text-xl font-extrabold text-emerald-700 tabular-nums">{formatPaiseToINR(totalPaid, true)}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200">
          <span className="text-[11px] font-bold uppercase text-slate-500">Payable</span>
          <p className={`mt-1 text-xl font-extrabold tabular-nums ${totalOutstanding > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
            {formatPaiseToINR(totalOutstanding, true)}
          </p>
        </div>
      </div>

      {/* Search & Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={filter.from} onChange={e => onFilterChange({ ...filter, from: e.target.value })} className="h-9 px-2.5 rounded-xl border border-slate-300 text-xs" />
            <span className="text-xs text-slate-400">to</span>
            <input type="date" value={filter.to} onChange={e => onFilterChange({ ...filter, to: e.target.value })} className="h-9 px-2.5 rounded-xl border border-slate-300 text-xs" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedPersonAccount && selectedPersonAccount.balance_payable_paise > 0 && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setPayModal({
                    person_name: selectedPersonAccount.person_name,
                    party_id: selectedPersonAccount.party_id,
                    max_balance_paise: selectedPersonAccount.balance_payable_paise,
                    is_bulk: true
                  });
                  setPayForm({
                    amount: String(selectedPersonAccount.balance_payable_paise / 100),
                    date: todayIST(),
                    mode: 'CASH',
                    notes: ''
                  });
                }}
                className="h-10 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <IndianRupee className="w-3.5 h-3.5" /> Pay {selectedPersonAccount.person_name} ({formatPaiseToINR(selectedPersonAccount.balance_payable_paise, true)})
              </button>
            )}
            <button
              type="button"
              onClick={() => { setError(null); setAddBatchOpen(true); }}
              className="h-10 px-4 rounded-xl bg-brand-900 hover:bg-brand-950 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Send Sarees to Polish
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search person or item..."
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-300 text-xs"
            />
          </div>
          <select value={personFilter} onChange={e => setPersonFilter(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-300 text-xs bg-white">
            <option value="">All polishers</option>
            {uniquePeople.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="h-10 px-3 rounded-xl border border-slate-300 text-xs bg-white">
            <option value="ALL">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="RECEIVED">Received</option>
          </select>
          <select value={payFilter} onChange={e => setPayFilter(e.target.value as any)} className="h-10 px-3 rounded-xl border border-slate-300 text-xs bg-white">
            <option value="ALL">All payment states</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PART">Part paid</option>
            <option value="PAID">Paid</option>
          </select>
        </div>
      </div>

      {error && !addBatchOpen && !receiveEntry && !payModal && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-rose-600 hover:underline">Dismiss</button>
        </div>
      )}

      {voidTarget && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-rose-900">Void polishing entry for {voidTarget.person_name}?</span>
          <input
            type="text"
            value={voidReason}
            onChange={e => setVoidReason(e.target.value)}
            placeholder="Reason for voiding..."
            className="flex-1 min-w-[180px] h-9 px-3 rounded-lg border border-rose-300 bg-white text-xs"
          />
          <button type="button" disabled={busy} onClick={confirmVoid} className="h-9 px-3 rounded-lg bg-rose-700 text-white text-xs font-bold">Confirm Void</button>
          <button type="button" onClick={() => setVoidTarget(null)} className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs">Cancel</button>
        </div>
      )}

      {/* Polishing Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase font-bold text-slate-500">
                <th className="px-3 py-2.5 whitespace-nowrap">Date</th>
                <th className="px-3 py-2.5">Person</th>
                <th className="px-3 py-2.5">Item</th>
                <th className="px-3 py-2.5 text-right">Sarees</th>
                <th className="px-3 py-2.5 text-right">Unit price</th>
                <th className="px-3 py-2.5 text-right">Total</th>
                <th className="px-3 py-2.5 text-right">Received</th>
                <th className="px-3 py-2.5 text-right">Paid</th>
                <th className="px-3 py-2.5 text-right">Balance</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEntries.length === 0 ? (
                <tr><td colSpan={11} className="p-8 text-center text-slate-400">No polishing entries match the filters.</td></tr>
              ) : filteredEntries.map(e => {
                const pending = Math.max(0, e.sarees_sent - e.sarees_received);
                const itemName = (e as any).item_name ?? 'Silk Saree';
                const isExpanded = expandedRowId === e.id;
                const personPayments = accountsData.payments.filter(
                  p => p.status === 'ACTIVE' && p.person_name.toLowerCase() === e.person_name.toLowerCase()
                );
                const canExpandPayments = e.payment_status === 'PART' || e.payment_status === 'PAID';
                const hasPayments = e.paid_paise > 0;

                return (
                  <React.Fragment key={e.id}>
                    <tr className="hover:bg-slate-50/70">
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-600">{fmtDate(e.sent_date)}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-900">{e.person_name}</td>
                      <td className="px-3 py-2.5 text-slate-700">{itemName}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{e.sarees_sent}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatPaiseToINR(e.unit_price_paise, true)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className="font-semibold text-slate-900">{formatPaiseToINR(e.accrued_charge_paise, true)}</span>
                        {e.provisional_charge_paise > 0 && (
                          <span className="block text-[10px] text-slate-400">+{formatPaiseToINR(e.provisional_charge_paise, true)} prov.</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{e.sarees_received}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{formatPaiseToINR(e.paid_paise, true)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-rose-700">{formatPaiseToINR(e.balance_paise, true)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          e.payment_status === 'PAID' ? 'bg-emerald-50 text-emerald-700' :
                          e.payment_status === 'PART' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {e.payment_status === 'PAID' ? 'Paid ✓' : e.payment_status === 'PART' ? 'Part paid' : 'Unpaid'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {pending > 0 && (
                            <button
                              type="button"
                              onClick={() => { setError(null); setReceiveEntry(e); setReceiveQty(String(pending)); setReceiveDate(todayIST()); }}
                              className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100"
                            >
                              Receive
                            </button>
                          )}
                          {e.balance_paise > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setError(null);
                                setPayModal({
                                  person_name: e.person_name,
                                  party_id: e.party_id,
                                  item_name: itemName,
                                  max_balance_paise: e.balance_paise,
                                  is_bulk: false
                                });
                                setPayForm({
                                  amount: String(e.balance_paise / 100),
                                  date: todayIST(),
                                  mode: 'CASH',
                                  notes: ''
                                });
                              }}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                            >
                              Pay
                            </button>
                          )}
                          {e.payment_status === 'PAID' && (
                            <span className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Paid
                            </span>
                          )}
                          {canExpandPayments && (
                            <button
                              type="button"
                              onClick={() => setExpandedRowId(isExpanded ? null : e.id)}
                              className="px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-medium inline-flex items-center gap-0.5"
                              title="View payment history"
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (hasPayments) {
                                setError('Cannot void: this entry has payments recorded.');
                                return;
                              }
                              setError(null);
                              setVoidTarget(e);
                              setVoidReason('');
                            }}
                            className={`p-1 rounded ${hasPayments ? 'text-slate-300 cursor-not-allowed' : 'text-slate-400 hover:text-rose-700'}`}
                            title={hasPayments ? 'Cannot void: payments recorded' : 'Void'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/80">
                        <td colSpan={11} className="px-6 py-3">
                          <p className="text-[11px] font-bold uppercase text-slate-500 mb-1.5">
                            Payments recorded for {e.person_name}
                          </p>
                          {personPayments.length === 0 ? (
                            <p className="text-xs text-slate-400">No payment records found.</p>
                          ) : (
                            <div className="space-y-1">
                              {personPayments.map(p => (
                                <div key={p.id} className="flex flex-wrap items-center gap-4 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                                  <span className="font-mono text-slate-600">{fmtDate(p.date)}</span>
                                  <span className="font-bold text-emerald-700 tabular-nums">{formatPaiseToINR(p.amount_paise, true)}</span>
                                  <span className="px-2 py-0.5 rounded bg-slate-100 text-[11px] font-semibold">{p.mode}</span>
                                  {p.notes && <span className="text-slate-500">{p.notes}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Send to Polish Modal */}
      {addBatchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Send Sarees to Polish</h3>
            {error && <p className="text-xs text-rose-700 bg-rose-50 p-2 rounded-lg">{error}</p>}
            <form onSubmit={handleSend} className="space-y-3">
              <label className="block text-xs font-bold text-slate-700">Polisher Name
                <input required value={sendForm.person_name} onChange={e => setSendForm({ ...sendForm, person_name: e.target.value })} className={inputCls} />
              </label>
              <label className="block text-xs font-bold text-slate-700">Item Name
                <input required value={sendForm.item_name} onChange={e => setSendForm({ ...sendForm, item_name: e.target.value })} className={inputCls} />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="block text-xs font-bold text-slate-700">Sarees
                  <input type="number" min={1} required value={sendForm.sarees_sent} onChange={e => setSendForm({ ...sendForm, sarees_sent: e.target.value })} className={inputCls} />
                </label>
                <label className="block text-xs font-bold text-slate-700">Rate (₹)
                  <input type="number" min={0} step="0.01" required value={sendForm.unit_price} onChange={e => setSendForm({ ...sendForm, unit_price: e.target.value })} className={inputCls} />
                </label>
                <label className="block text-xs font-bold text-slate-700">Date
                  <input type="date" value={sendForm.sent_date} onChange={e => setSendForm({ ...sendForm, sent_date: e.target.value })} className={inputCls} />
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setAddBatchOpen(false)} className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold">Cancel</button>
                <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-brand-900 text-white text-xs font-bold">Send</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive Modal */}
      {receiveEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Receive from {receiveEntry.person_name}</h3>
            {error && <p className="text-xs text-rose-700 bg-rose-50 p-2 rounded-lg">{error}</p>}
            <form onSubmit={handleReceive} className="space-y-3">
              <label className="block text-xs font-bold text-slate-700">
                Quantity received (max {receiveEntry.sarees_sent - receiveEntry.sarees_received})
                <input type="number" min={1} max={receiveEntry.sarees_sent - receiveEntry.sarees_received} required value={receiveQty} onChange={e => setReceiveQty(e.target.value)} className={inputCls} />
              </label>
              <label className="block text-xs font-bold text-slate-700">Date
                <input type="date" value={receiveDate} onChange={e => setReceiveDate(e.target.value)} className={inputCls} />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setReceiveEntry(null)} className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold">Cancel</button>
                <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-indigo-700 text-white text-xs font-bold">Save Receive</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inline Row Pay / Bulk Pay Modal */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Pay {payModal.person_name}</h3>
              {payModal.item_name && (
                <p className="text-xs font-semibold text-slate-600 mt-0.5">Item: {payModal.item_name}</p>
              )}
              <p className="text-xs text-slate-500 mt-0.5">
                Balance due: <b className="text-rose-700">{formatPaiseToINR(Math.max(0, payModal.max_balance_paise), true)}</b>
              </p>
            </div>
            {error && <p className="text-xs text-rose-700 bg-rose-50 p-2 rounded-lg">{error}</p>}
            <form onSubmit={handlePay} className="space-y-3">
              <label className="block text-xs font-bold text-slate-700">Amount (₹)
                <input
                  type="number"
                  min={0.01}
                  max={payModal.max_balance_paise / 100}
                  step="0.01"
                  required
                  value={payForm.amount}
                  onChange={e => setPayForm({ ...payForm, amount: e.target.value })}
                  className={inputCls}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-bold text-slate-700">Payment date
                  <input
                    type="date"
                    required
                    max={todayIST()}
                    value={payForm.date}
                    onChange={e => setPayForm({ ...payForm, date: e.target.value })}
                    className={inputCls}
                  />
                </label>
                <label className="block text-xs font-bold text-slate-700">Mode
                  <select value={payForm.mode} onChange={e => setPayForm({ ...payForm, mode: e.target.value })} className={inputCls}>
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="BANK">Bank</option>
                  </select>
                </label>
              </div>
              <label className="block text-xs font-bold text-slate-700">Note
                <input type="text" value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} placeholder="Optional note" className={inputCls} />
              </label>

              {payModal.is_bulk && bulkAllocationPreview.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                  <p className="text-[11px] font-bold uppercase text-slate-500">Oldest-first allocation breakdown</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {bulkAllocationPreview.map(r => (
                      <div key={r.id} className="flex items-center justify-between text-xs text-slate-700">
                        <span>{fmtDate(r.sent_date)} · {r.item_name}</span>
                        <span className="font-bold text-emerald-700 tabular-nums">{formatPaiseToINR(r.allocated_paise, true)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setPayModal(null)} className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold">Cancel</button>
                <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold">Record Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
