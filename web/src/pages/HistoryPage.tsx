import React, { useState, useEffect, useMemo } from 'react';
import {
  History,
  Search,
  Filter,
  Calendar,
  Building2,
  DollarSign,
  ShoppingBag,
  Truck,
  Sparkles,
  CreditCard,
  Undo2,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronDown,
  RotateCcw,
  Eye,
  FileSpreadsheet
} from 'lucide-react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { TransactionDetailsModal } from '../components/ledger/TransactionDetailsModal';
import { RecordPaymentModal } from '../components/dues/RecordPaymentModal';
import { AddReturnModal } from '../components/history/AddReturnModal';
import {
  Transaction,
  Party,
  HistorySummary,
  formatINR,
  formatPaiseToINR
} from '@yorbalance/shared';
import { api } from '../lib/api';
import { useNavigate } from 'react-router-dom';

export const HistoryPage: React.FC = () => {
  const navigate = useNavigate();

  // Data states
  const [transactions, setTransactions] = useState<any[]>([]);
  const [summary, setSummary] = useState<HistorySummary>({
    total_sales: 0,
    total_purchases: 0,
    total_job_work: 0,
    total_payments: 0,
    total_returns: 0
  });
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [partyIdFilter, setPartyIdFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Modal states
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [paymentTx, setPaymentTx] = useState<Transaction | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [returnTx, setReturnTx] = useState<Transaction | null>(null);
  const [isReturnOpen, setIsReturnOpen] = useState(false);

  // Fetch parties on mount
  useEffect(() => {
    api.getParties().then(res => setParties(res.parties || [])).catch(() => {});
  }, []);

  // Fetch History data
  const loadHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getHistory({
        search: search.trim() || undefined,
        dateRange: dateRange !== 'custom' ? dateRange : undefined,
        startDate: dateRange === 'custom' && startDate ? startDate : undefined,
        endDate: dateRange === 'custom' && endDate ? endDate : undefined,
        type: typeFilter !== 'ALL' ? (typeFilter as any) : undefined,
        partyId: partyIdFilter || undefined,
        status: statusFilter !== 'ALL' ? (statusFilter as any) : undefined,
        minAmount: minAmount ? parseFloat(minAmount) : undefined,
        maxAmount: maxAmount ? parseFloat(maxAmount) : undefined
      });

      setTransactions(res.transactions || []);
      if (res.summary) {
        setSummary(res.summary);
      }
    } catch (err: any) {
      console.error('Failed to load history:', err);
      setError(err.message || 'Failed to load transaction history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [dateRange, startDate, endDate, typeFilter, partyIdFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadHistory();
  };

  const resetFilters = () => {
    setSearch('');
    setDateRange('all');
    setStartDate('');
    setEndDate('');
    setTypeFilter('ALL');
    setPartyIdFilter('');
    setStatusFilter('ALL');
    setMinAmount('');
    setMaxAmount('');
  };

  const handleOpenDetail = async (tx: any) => {
    if (tx.item_kind === 'PAYMENT' || tx.item_kind === 'RETURN') {
      // payment or return row
      setSelectedTx({
        id: tx.id,
        shop_id: '',
        party_id: tx.party_id,
        party_name: tx.party_name,
        party_type: tx.party_type,
        type: tx.type,
        invoice_number: tx.invoice_number,
        invoice_date: tx.invoice_date,
        subtotal_paise: tx.grand_total_paise,
        tax_paise: 0,
        cgst_paise: 0,
        sgst_paise: 0,
        igst_paise: 0,
        grand_total_paise: tx.grand_total_paise,
        paid_paise: tx.paid_paise,
        pending_paise: tx.pending_paise,
        status: tx.status,
        notes: tx.notes,
        created_at: tx.created_at
      });
      setIsDetailOpen(true);
      return;
    }

    try {
      const res = await api.getHistoryDetails(tx.id);
      setSelectedTx(res.transaction);
    } catch {
      setSelectedTx(tx);
    }
    setIsDetailOpen(true);
  };

  const handleOpenPayment = (tx: Transaction) => {
    setPaymentTx(tx);
    setIsPaymentOpen(true);
  };

  const handleOpenReturn = (tx: Transaction) => {
    setReturnTx(tx);
    setIsReturnOpen(true);
  };

  const handleOpenPartyLedger = (partyId: string) => {
    navigate(`/ledger?party_id=${partyId}`);
  };

  // Group transactions by date for mobile view
  const groupedTransactions = useMemo(() => {
    const groups: { [date: string]: any[] } = {};
    for (const item of transactions) {
      const dateKey = item.invoice_date || 'Unknown Date';
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(item);
    }
    return groups;
  }, [transactions]);

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'SALE':
        return { label: 'Sale', icon: <ShoppingBag className="w-3 h-3" />, classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'PURCHASE':
        return { label: 'Purchase', icon: <Truck className="w-3 h-3" />, classes: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'JOB_WORK':
        return { label: 'Job Work', icon: <Sparkles className="w-3 h-3" />, classes: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'PAYMENT':
        return { label: 'Payment', icon: <CreditCard className="w-3 h-3" />, classes: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'RETURN':
        return { label: 'Return', icon: <Undo2 className="w-3 h-3" />, classes: 'bg-rose-50 text-rose-700 border-rose-200' };
      default:
        return { label: type, icon: <History className="w-3 h-3" />, classes: 'bg-slate-50 text-slate-700 border-slate-200' };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SETTLED':
        return { label: 'Settled', icon: <CheckCircle2 className="w-3 h-3" />, classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'PARTIAL':
        return { label: 'Partial', icon: <Clock className="w-3 h-3" />, classes: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'OVERDUE':
        return { label: 'Overdue', icon: <AlertCircle className="w-3 h-3" />, classes: 'bg-rose-50 text-rose-700 border-rose-200' };
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
                Audit Registry
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                Live Ledger Trail
              </span>
            </div>
            <h1 className="font-serif-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
              History
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Complete chronological audit of sales, raw silk purchases, job-work, returns, and clearances.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Export / Print
            </button>
          </div>
        </div>

        {/* History Summary Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Sales</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-lg sm:text-2xl font-mono font-bold text-slate-900">
              {formatINR(summary.total_sales)}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">Selected period revenue</span>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Purchases</span>
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                <Truck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-lg sm:text-2xl font-mono font-bold text-slate-900">
              {formatINR(summary.total_purchases)}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">Raw silk & zari procurement</span>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Job Work</span>
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-lg sm:text-2xl font-mono font-bold text-slate-900">
              {formatINR(summary.total_job_work)}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">Artisan weaving & finishing</span>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Payments Recorded</span>
              <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-lg sm:text-2xl font-mono font-bold text-purple-900">
              {formatINR(summary.total_payments)}
            </div>
            <span className="text-[10px] text-purple-600 mt-1 block font-medium">Cleared via NEFT / Cash / Chq</span>
          </div>
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
                placeholder="Search by party name, invoice #, or phone number..."
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={dateRange}
                onChange={e => setDateRange(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="this_week">This Week</option>
                <option value="this_month">This Month</option>
                <option value="this_fy">This Financial Year</option>
                <option value="custom">Custom Date Range</option>
              </select>

              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="ALL">All Types</option>
                <option value="SALE">Sales Only</option>
                <option value="PURCHASE">Purchases Only</option>
                <option value="JOB_WORK">Job Work</option>
                <option value="PAYMENT">Payments Only</option>
                <option value="RETURN">Returns Only</option>
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
                <span className="hidden sm:inline">Filters</span>
              </button>

              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm transition-colors"
              >
                Search
              </button>
            </div>
          </form>

          {/* Advanced Collapsible Filters */}
          {showAdvancedFilters && (
            <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs animate-in fade-in duration-150">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Filter by Party</label>
                <select
                  value={partyIdFilter}
                  onChange={e => setPartyIdFilter(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">All Parties</option>
                  {parties.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Payment Status</label>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs focus:ring-2 focus:ring-purple-500"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">Pending Only</option>
                  <option value="PARTIAL">Partially Paid</option>
                  <option value="OVERDUE">Overdue Dues</option>
                  <option value="SETTLED">Fully Settled</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Min Amount (₹)</label>
                <input
                  type="number"
                  placeholder="Min ₹"
                  value={minAmount}
                  onChange={e => setMinAmount(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-slate-800 text-xs focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Max Amount (₹)</label>
                <input
                  type="number"
                  placeholder="Max ₹"
                  value={maxAmount}
                  onChange={e => setMaxAmount(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-slate-800 text-xs focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {dateRange === 'custom' && (
                <>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">From Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-slate-800 text-xs focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">To Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-slate-800 text-xs focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </>
              )}

              <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-xs font-semibold text-purple-700 hover:text-purple-900 flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Reset All Filters
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Transaction Content Table & Cards */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading transaction history...
          </div>
        ) : transactions.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <History className="w-6 h-6" />
            </div>
            <h3 className="font-serif-display text-lg font-bold text-slate-900">No Transactions Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No transactions match the selected filters or date range. Try clearing filters or recording a new entry.
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
            {/* Desktop Table View (Hidden on mobile) */}
            <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200 text-[10px] uppercase tracking-wider font-bold text-slate-500">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Invoice / Ref #</th>
                      <th className="py-3 px-4">Party</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4 text-right">Total (₹)</th>
                      <th className="py-3 px-4 text-right">Paid (₹)</th>
                      <th className="py-3 px-4 text-right">Remaining (₹)</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {transactions.map((tx) => {
                      const typeBadge = getTypeBadge(tx.type);
                      const statusBadge = getStatusBadge(tx.status);
                      const amount = tx.amount_rupees !== undefined ? tx.amount_rupees : Math.round(tx.grand_total_paise / 100);
                      const paid = tx.paid_rupees !== undefined ? tx.paid_rupees : Math.round((tx.paid_paise || 0) / 100);
                      const remaining = tx.remaining_due_rupees !== undefined ? tx.remaining_due_rupees : Math.max(0, amount - paid - (tx.return_rupees || 0));

                      return (
                        <tr
                          key={tx.id}
                          onClick={() => handleOpenDetail(tx)}
                          className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                        >
                          <td className="py-3.5 px-4 font-mono text-slate-600 text-[11px] whitespace-nowrap">
                            {tx.invoice_date}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {tx.invoice_number}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-slate-800 block truncate max-w-[180px]">
                              {tx.party_name}
                            </span>
                            <span className="text-[10px] text-slate-400 uppercase font-medium">
                              {tx.party_type}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${typeBadge.classes}`}>
                              {typeBadge.icon} {typeBadge.label}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900 text-right whitespace-nowrap">
                            {formatINR(amount)}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-emerald-700 text-right whitespace-nowrap">
                            {formatINR(paid)}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-right whitespace-nowrap">
                            <span className={remaining > 0 ? 'text-amber-600' : 'text-slate-400'}>
                              {formatINR(remaining)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge.classes}`}>
                              {statusBadge.icon} {statusBadge.label}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleOpenDetail(tx)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                              title="View Invoice Breakdown"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card View (Grouped by Date) */}
            <div className="md:hidden space-y-4">
              {Object.entries(groupedTransactions).map(([date, items]) => (
                <div key={date} className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <Calendar className="w-3.5 h-3.5 text-purple-600" />
                    <span className="text-xs font-bold text-slate-700">{date}</span>
                    <span className="text-[10px] text-slate-400">({items.length} records)</span>
                  </div>

                  <div className="space-y-2">
                    {items.map((tx) => {
                      const typeBadge = getTypeBadge(tx.type);
                      const statusBadge = getStatusBadge(tx.status);
                      const amount = tx.amount_rupees !== undefined ? tx.amount_rupees : Math.round(tx.grand_total_paise / 100);
                      const paid = tx.paid_rupees !== undefined ? tx.paid_rupees : Math.round((tx.paid_paise || 0) / 100);
                      const remaining = tx.remaining_due_rupees !== undefined ? tx.remaining_due_rupees : Math.max(0, amount - paid - (tx.return_rupees || 0));

                      return (
                        <div
                          key={tx.id}
                          onClick={() => handleOpenDetail(tx)}
                          className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm active:scale-[0.99] transition-transform space-y-3"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-slate-900 text-xs">
                                  {tx.invoice_number}
                                </span>
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${typeBadge.classes}`}>
                                  {typeBadge.label}
                                </span>
                              </div>
                              <p className="font-bold text-slate-800 text-xs mt-1">
                                {tx.party_name}
                              </p>
                              <span className="text-[10px] text-slate-400 capitalize">
                                {tx.party_type?.toLowerCase()}
                              </span>
                            </div>

                            <div className="text-right">
                              <span className="font-mono font-bold text-slate-900 text-sm block">
                                {formatINR(amount)}
                              </span>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border mt-1 ${statusBadge.classes}`}>
                                {statusBadge.icon} {statusBadge.label}
                              </span>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                            <div>
                              <span>Paid: </span>
                              <span className="text-emerald-700 font-bold">{formatINR(paid)}</span>
                            </div>
                            <div>
                              <span>Due: </span>
                              <span className={`font-bold ${remaining > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                {formatINR(remaining)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Transaction Details Modal */}
      <TransactionDetailsModal
        transaction={selectedTx}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        onOpenPartyLedger={handleOpenPartyLedger}
        onRecordPayment={handleOpenPayment}
        onAddReturn={handleOpenReturn}
      />

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        onSuccess={() => {
          loadHistory();
          if (selectedTx) {
            handleOpenDetail(selectedTx);
          }
        }}
        initialPartyId={paymentTx?.party_id}
        initialPartyName={paymentTx?.party_name}
        initialTransactionId={paymentTx?.id}
        initialInvoiceNumber={paymentTx?.invoice_number}
        initialRemainingRupees={paymentTx ? Math.round(paymentTx.pending_paise / 100) : undefined}
        parties={parties}
      />

      {/* Add Return Modal */}
      <AddReturnModal
        isOpen={isReturnOpen}
        onClose={() => setIsReturnOpen(false)}
        onSuccess={() => {
          loadHistory();
          if (selectedTx) {
            handleOpenDetail(selectedTx);
          }
        }}
        transaction={returnTx}
      />
    </DashboardLayout>
  );
};
