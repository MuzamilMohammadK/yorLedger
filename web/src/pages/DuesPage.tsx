import React, { useState, useEffect } from 'react';
import {
  Clock,
  Search,
  Filter,
  CreditCard,
  Building2,
  Calendar,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  RotateCcw,
  ShoppingBag,
  Truck,
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight
} from 'lucide-react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { RecordPaymentModal } from '../components/dues/RecordPaymentModal';
import { TransactionDetailsModal } from '../components/ledger/TransactionDetailsModal';
import {
  DueRecord,
  DuesSummary,
  Party,
  PartyType,
  Transaction,
  formatINR
} from '@yorbalance/shared';
import { api } from '../lib/api';
import { useNavigate } from 'react-router-dom';

export const DuesPage: React.FC = () => {
  const navigate = useNavigate();

  // Data states
  const [dues, setDues] = useState<DueRecord[]>([]);
  const [summary, setSummary] = useState<DuesSummary>({
    total_receivable: 0,
    total_payable: 0,
    overdue_receivable: 0,
    overdue_payable: 0
  });
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab & Filter states
  const [activeTab, setActiveTab] = useState<'RECEIVABLE' | 'PAYABLE' | 'ALL'>('RECEIVABLE');
  const [search, setSearch] = useState('');
  const [partyTypeFilter, setPartyTypeFilter] = useState<'ALL' | PartyType>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Modal states
  const [paymentDue, setPaymentDue] = useState<DueRecord | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Fetch parties on mount
  useEffect(() => {
    api.getParties().then(res => setParties(res.parties || [])).catch(() => {});
  }, []);

  // Fetch dues and summary
  const loadDues = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getDues({
        view: activeTab,
        search: search.trim() || undefined,
        partyType: partyTypeFilter !== 'ALL' ? partyTypeFilter : undefined,
        status: statusFilter !== 'ALL' ? (statusFilter as any) : undefined,
        minAmount: minAmount ? parseFloat(minAmount) : undefined,
        maxAmount: maxAmount ? parseFloat(maxAmount) : undefined
      });

      setDues(res.dues || []);
      if (res.summary) {
        setSummary(res.summary);
      }
    } catch (err: any) {
      console.error('Failed to load dues:', err);
      setError(err.message || 'Failed to load outstanding dues');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDues();
  }, [activeTab, partyTypeFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadDues();
  };

  const resetFilters = () => {
    setSearch('');
    setPartyTypeFilter('ALL');
    setStatusFilter('ALL');
    setMinAmount('');
    setMaxAmount('');
  };

  const handleRecordPayment = (due: DueRecord) => {
    setPaymentDue(due);
    setIsPaymentOpen(true);
  };

  const handleOpenDetail = async (due: DueRecord) => {
    try {
      const res = await api.getHistoryDetails(due.id);
      setSelectedTx(res.transaction);
    } catch {
      // Fallback object
      setSelectedTx({
        id: due.id,
        shop_id: '',
        party_id: due.party_id,
        party_name: due.party_name,
        party_type: due.party_type,
        type: due.type,
        invoice_number: due.invoice_number,
        invoice_date: due.invoice_date,
        due_date: due.due_date,
        subtotal_paise: Math.round(due.original_amount * 100),
        tax_paise: 0,
        cgst_paise: 0,
        sgst_paise: 0,
        igst_paise: 0,
        grand_total_paise: Math.round(due.original_amount * 100),
        paid_paise: Math.round(due.amount_paid * 100),
        return_paise: Math.round(due.returns * 100),
        pending_paise: Math.round(due.remaining_due * 100),
        status: due.status,
        created_at: new Date().toISOString()
      });
    }
    setIsDetailOpen(true);
  };

  const handleOpenPartyLedger = (partyId: string) => {
    navigate(`/ledger?party_id=${partyId}`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SETTLED':
        return { label: 'Settled', icon: <CheckCircle2 className="w-3 h-3" />, classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'PARTIAL':
        return { label: 'Partially Paid', icon: <Clock className="w-3 h-3" />, classes: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'OVERDUE':
        return { label: 'Overdue Alert', icon: <AlertTriangle className="w-3 h-3" />, classes: 'bg-rose-50 text-rose-700 border-rose-300 font-extrabold animate-pulse' };
      default:
        return { label: 'Pending', icon: <AlertCircle className="w-3 h-3" />, classes: 'bg-amber-50 text-amber-700 border-amber-200' };
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-600">
                Credit & Clearance Manager
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                Live Aging & Dues
              </span>
            </div>
            <h1 className="font-serif-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
              Dues & Clearances
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Track customer receivables, weaver & supplier payables, overdue balances, and record payments.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setPaymentDue(null);
                setIsPaymentOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md shadow-purple-600/20 transition-all flex items-center gap-1.5"
            >
              <CreditCard className="w-4 h-4" /> Record New Payment
            </button>
          </div>
        </div>

        {/* 4 Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Total Receivable */}
          <div
            onClick={() => setActiveTab('RECEIVABLE')}
            className={`p-4 sm:p-5 rounded-2xl border cursor-pointer transition-all ${
              activeTab === 'RECEIVABLE'
                ? 'bg-emerald-50/70 border-emerald-300 shadow-sm ring-1 ring-emerald-400'
                : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" /> Customer Receivables
              </span>
              <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-lg sm:text-2xl font-mono font-bold text-emerald-900">
              {formatINR(summary.total_receivable)}
            </div>
            <span className="text-[10px] text-emerald-700 mt-1 block">To receive from boutiques & buyers</span>
          </div>

          {/* Total Payable */}
          <div
            onClick={() => setActiveTab('PAYABLE')}
            className={`p-4 sm:p-5 rounded-2xl border cursor-pointer transition-all ${
              activeTab === 'PAYABLE'
                ? 'bg-blue-50/70 border-blue-300 shadow-sm ring-1 ring-blue-400'
                : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800 flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-blue-600" /> Supplier Payables
              </span>
              <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-lg sm:text-2xl font-mono font-bold text-blue-900">
              {formatINR(summary.total_payable)}
            </div>
            <span className="text-[10px] text-blue-700 mt-1 block">To pay weavers & yarn mills</span>
          </div>

          {/* Overdue Receivable */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-rose-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-rose-50 rounded-bl-full -z-0" />
            <div className="flex items-center justify-between relative z-10">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
                Overdue Receivables
              </span>
              <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-lg sm:text-2xl font-mono font-bold text-rose-600 relative z-10">
              {formatINR(summary.overdue_receivable)}
            </div>
            <span className="text-[10px] text-rose-500 mt-1 block relative z-10 font-medium">
              Past payment credit limit
            </span>
          </div>

          {/* Overdue Payable */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-amber-200 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                Overdue Payables
              </span>
              <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-lg sm:text-2xl font-mono font-bold text-amber-800">
              {formatINR(summary.overdue_payable)}
            </div>
            <span className="text-[10px] text-amber-700 mt-1 block font-medium">
              Awaiting your disbursement
            </span>
          </div>
        </div>

        {/* Primary Segmented Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('RECEIVABLE')}
            className={`pb-3 px-5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'RECEIVABLE'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>Customer Dues (Receivable)</span>
          </button>

          <button
            onClick={() => setActiveTab('PAYABLE')}
            className={`pb-3 px-5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'PAYABLE'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>Supplier & Artisan Dues (Payable)</span>
          </button>

          <button
            onClick={() => setActiveTab('ALL')}
            className={`pb-3 px-5 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'ALL'
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>All Dues Combined</span>
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
          <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search party name, invoice number, or phone..."
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="ALL">All Due Statuses</option>
                <option value="OVERDUE">Overdue Only 🚨</option>
                <option value="PARTIAL">Partially Paid</option>
                <option value="PENDING">Pending (Unpaid)</option>
                <option value="SETTLED">Settled Bills</option>
              </select>

              <select
                value={partyTypeFilter}
                onChange={e => setPartyTypeFilter(e.target.value as any)}
                className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="ALL">All Party Types</option>
                <option value="CUSTOMER">Customers</option>
                <option value="SUPPLIER">Suppliers</option>
                <option value="ARTISAN">Artisans</option>
              </select>

              <button
                type="button"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={`p-2 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1 ${
                  showAdvancedFilters ? 'bg-purple-50 border-purple-300 text-purple-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
                title="Toggle More Filters"
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">Amount Range</span>
              </button>

              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm transition-colors"
              >
                Search
              </button>
            </div>
          </form>

          {/* Advanced Collapsible Filter */}
          {showAdvancedFilters && (
            <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs animate-in fade-in duration-150">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Min Due (₹)</label>
                <input
                  type="number"
                  placeholder="Min ₹"
                  value={minAmount}
                  onChange={e => setMinAmount(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-slate-800 text-xs focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Max Due (₹)</label>
                <input
                  type="number"
                  placeholder="Max ₹"
                  value={maxAmount}
                  onChange={e => setMaxAmount(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-slate-800 text-xs focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-xs font-semibold text-purple-700 hover:text-purple-900 flex items-center gap-1 pb-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset Filters
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content Table / Cards */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Calculating live dues balances...
          </div>
        ) : dues.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="font-serif-display text-lg font-bold text-slate-900">All Clear! No Dues Pending</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              There are no outstanding balances matching the current view. All invoices are either fully settled or filtered out.
            </p>
            <button
              onClick={resetFilters}
              className="px-4 py-2 rounded-xl bg-purple-50 text-purple-700 font-bold text-xs hover:bg-purple-100"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-[10px] uppercase tracking-wider font-bold text-slate-500">
                    <tr>
                      <th className="py-3 px-4">Party & Type</th>
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Invoice Date</th>
                      <th className="py-3 px-4">Due Date</th>
                      <th className="py-3 px-4 text-right">Bill Total (₹)</th>
                      <th className="py-3 px-4 text-right">Returns (₹)</th>
                      <th className="py-3 px-4 text-right">Paid (₹)</th>
                      <th className="py-3 px-4 text-right">Remaining Due (₹)</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {dues.map((d) => {
                      const statusBadge = getStatusBadge(d.status);
                      const isCustomer = d.party_type === 'CUSTOMER' || d.type === 'SALE';

                      return (
                        <tr
                          key={d.id}
                          onClick={() => handleOpenDetail(d)}
                          className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${
                            d.status === 'OVERDUE' ? 'bg-rose-50/20' : ''
                          }`}
                        >
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-slate-900 block truncate max-w-[180px]">
                              {d.party_name}
                            </span>
                            <span className="text-[10px] text-slate-400 uppercase font-medium">
                              {d.party_type}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {d.invoice_number}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-600 text-[11px] whitespace-nowrap">
                            {d.invoice_date}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[11px] whitespace-nowrap">
                            {d.due_date ? (
                              <span className={d.status === 'OVERDUE' ? 'text-rose-600 font-bold' : 'text-slate-600'}>
                                {d.due_date}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-semibold text-slate-800 text-right whitespace-nowrap">
                            {formatINR(d.original_amount)}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-rose-600 text-right whitespace-nowrap">
                            {d.returns > 0 ? `-${formatINR(d.returns)}` : '—'}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-emerald-700 text-right whitespace-nowrap">
                            {formatINR(d.amount_paid)}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-right whitespace-nowrap">
                            <span className={`text-sm ${
                              d.status === 'OVERDUE'
                                ? 'text-rose-600 font-extrabold'
                                : isCustomer
                                ? 'text-emerald-700'
                                : 'text-amber-700'
                            }`}>
                              {formatINR(d.remaining_due)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge.classes}`}>
                              {statusBadge.icon} {statusBadge.label}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            {d.remaining_due > 0 ? (
                              <button
                                onClick={() => handleRecordPayment(d)}
                                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-[11px] transition-all shadow-sm shadow-purple-600/20 inline-flex items-center gap-1"
                              >
                                <CreditCard className="w-3 h-3" /> Record Payment
                              </button>
                            ) : (
                              <span className="text-[11px] text-emerald-600 font-bold">Settled</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {dues.map((d) => {
                const statusBadge = getStatusBadge(d.status);
                const isCustomer = d.party_type === 'CUSTOMER' || d.type === 'SALE';

                return (
                  <div
                    key={d.id}
                    onClick={() => handleOpenDetail(d)}
                    className={`bg-white rounded-2xl p-4 border shadow-sm transition-all space-y-3 ${
                      d.status === 'OVERDUE' ? 'border-rose-300 bg-rose-50/10' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 text-xs">
                            {d.invoice_number}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${statusBadge.classes}`}>
                            {statusBadge.label}
                          </span>
                        </div>
                        <p className="font-bold text-slate-900 text-xs mt-1">
                          {d.party_name}
                        </p>
                        <span className="text-[10px] text-slate-400 capitalize">
                          {d.party_type?.toLowerCase()}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Remaining Due
                        </span>
                        <span className={`font-mono font-bold text-base ${
                          d.status === 'OVERDUE'
                            ? 'text-rose-600'
                            : isCustomer
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                        }`}>
                          {formatINR(d.remaining_due)}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px] text-slate-500 font-mono">
                      <div>
                        <span>Bill Total: </span>
                        <span className="font-semibold text-slate-800">{formatINR(d.original_amount)}</span>
                      </div>
                      <div className="text-right">
                        <span>Paid: </span>
                        <span className="font-semibold text-emerald-700">{formatINR(d.amount_paid)}</span>
                      </div>
                      <div>
                        <span>Due Date: </span>
                        <span className={d.status === 'OVERDUE' ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                          {d.due_date || '—'}
                        </span>
                      </div>
                      {d.returns > 0 && (
                        <div className="text-right text-rose-600">
                          <span>Returns: </span>
                          <span>-{formatINR(d.returns)}</span>
                        </div>
                      )}
                    </div>

                    {d.remaining_due > 0 && (
                      <div className="pt-1 flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleRecordPayment(d)}
                          className="w-full py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm transition-colors flex items-center justify-center gap-1.5"
                        >
                          <CreditCard className="w-3.5 h-3.5" /> Record Payment
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        onSuccess={() => {
          loadDues();
        }}
        initialPartyId={paymentDue?.party_id}
        initialPartyName={paymentDue?.party_name}
        initialTransactionId={paymentDue?.id}
        initialInvoiceNumber={paymentDue?.invoice_number}
        initialRemainingRupees={paymentDue?.remaining_due}
        parties={parties}
      />

      {/* Transaction Details Modal */}
      <TransactionDetailsModal
        transaction={selectedTx}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        onOpenPartyLedger={handleOpenPartyLedger}
        onRecordPayment={(tx) => {
          setIsDetailOpen(false);
          const matchedDue = dues.find(d => d.id === tx.id);
          if (matchedDue) {
            handleRecordPayment(matchedDue);
          } else {
            handleRecordPayment({
              id: tx.id,
              party_id: tx.party_id,
              party_name: tx.party_name,
              party_type: tx.party_type,
              invoice_number: tx.invoice_number,
              invoice_date: tx.invoice_date,
              original_amount: Math.round(tx.grand_total_paise / 100),
              returns: Math.round((tx.return_paise || 0) / 100),
              amount_paid: Math.round(tx.paid_paise / 100),
              remaining_due: Math.round(tx.pending_paise / 100),
              status: tx.status as any,
              type: tx.type
            });
          }
        }}
      />
    </DashboardLayout>
  );
};
