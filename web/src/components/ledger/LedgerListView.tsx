import React, { useMemo } from 'react';
import {
  Search,
  Plus,
  RefreshCw,
  ShoppingBag,
  Truck,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Building2,
  Calendar,
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  FileText,
  UserPlus
} from 'lucide-react';
import { Transaction, Party, LedgerSummary, formatINR, formatPaiseToINR } from '@yorbalance/shared';

interface LedgerListViewProps {
  transactions: Transaction[];
  summary: LedgerSummary;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  selectedParty: Party | null;
  onClearPartyFilter: () => void;
  activeTypeFilter: string;
  onTypeFilterChange: (type: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectTransaction: (tx: Transaction) => void;
  onOpenNewTransaction: () => void;
  onNavigateToNewParty: () => void;
}

export const LedgerListView: React.FC<LedgerListViewProps> = ({
  transactions,
  summary,
  loading,
  error,
  onRefresh,
  selectedParty,
  onClearPartyFilter,
  activeTypeFilter,
  onTypeFilterChange,
  searchQuery,
  onSearchChange,
  onSelectTransaction,
  onOpenNewTransaction,
  onNavigateToNewParty
}) => {
  // Format transaction dates into intuitive human labels
  const getRelativeDateLabel = (dateStr: string) => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    if (dateStr === today) return 'Today';
    if (dateStr === yesterday) return 'Yesterday';

    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Group transactions by date
  const groupedTransactions = useMemo(() => {
    const groups: { dateLabel: string; rawDate: string; items: Transaction[] }[] = [];
    const map = new Map<string, Transaction[]>();

    transactions.forEach(tx => {
      const date = tx.invoice_date || tx.created_at.split('T')[0];
      if (!map.has(date)) {
        map.set(date, []);
      }
      map.get(date)!.push(tx);
    });

    // Sort dates descending
    const sortedDates = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));
    sortedDates.forEach(date => {
      groups.push({
        dateLabel: getRelativeDateLabel(date),
        rawDate: date,
        items: map.get(date)!
      });
    });

    return groups;
  }, [transactions]);

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'SALE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShoppingBag className="w-2.5 h-2.5 text-emerald-600" /> Sale
          </span>
        );
      case 'PURCHASE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Truck className="w-2.5 h-2.5 text-blue-600" /> Purchase
          </span>
        );
      case 'JOB_WORK':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Sparkles className="w-2.5 h-2.5 text-amber-600" /> Job Work
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {type}
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SETTLED':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
            <CheckCircle2 className="w-3 h-3" /> Settled
          </span>
        );
      case 'PARTIAL':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
            <Clock className="w-3 h-3" /> Partial
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">
            <AlertCircle className="w-3 h-3" /> Pending
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Active Party Filter Banner */}
      {selectedParty && (
        <div className="bg-purple-900 text-white p-4 rounded-2xl shadow-sm flex items-center justify-between animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-purple-200 shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300">
                  Focused Party Ledger
                </span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-white/20 text-white capitalize">
                  {selectedParty.type.toLowerCase()}
                </span>
              </div>
              <h3 className="font-serif-display text-sm font-bold mt-0.5">
                {selectedParty.name}
              </h3>
              <p className="text-[11px] text-purple-200">
                Prop: {selectedParty.owner_name} &bull; {selectedParty.phone}
              </p>
            </div>
          </div>
          <button
            onClick={onClearPartyFilter}
            className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1 transition-colors"
          >
            Clear <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Summary KPI Cards Strip */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">
            To Receive
          </span>
          <div className="flex items-baseline justify-between mt-0.5">
            <span className="text-sm sm:text-lg font-bold font-mono text-emerald-700 truncate">
              {formatINR(summary.total_receivable)}
            </span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600 hidden sm:block shrink-0" />
          </div>
        </div>

        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">
            To Settle
          </span>
          <div className="flex items-baseline justify-between mt-0.5">
            <span className="text-sm sm:text-lg font-bold font-mono text-amber-700 truncate">
              {formatINR(summary.total_payable)}
            </span>
            <TrendingDown className="w-3.5 h-3.5 text-amber-600 hidden sm:block shrink-0" />
          </div>
        </div>

        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider block truncate">
            Total Entries
          </span>
          <div className="flex items-baseline justify-between mt-0.5">
            <span className="text-sm sm:text-lg font-bold font-serif-display text-slate-900">
              {summary.total_transactions}
            </span>
            <FileText className="w-3.5 h-3.5 text-purple-600 hidden sm:block shrink-0" />
          </div>
        </div>
      </div>

      {/* Search & Transaction Type Filter Pills */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search party name, invoice #, mobile number..."
            className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {[
            { id: 'ALL', label: 'All Vouchers' },
            { id: 'SALE', label: 'Sales' },
            { id: 'PURCHASE', label: 'Purchases' },
            { id: 'JOB_WORK', label: 'Job Work' },
            { id: 'PAYMENT', label: 'Settled Payments' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => onTypeFilterChange(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                activeTypeFilter === f.id
                  ? 'bg-purple-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions List View */}
      {loading ? (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-10 text-center shadow-sm">
          <RefreshCw className="w-6 h-6 text-purple-600 animate-spin mx-auto mb-2" />
          <p className="text-xs font-bold text-slate-700">Loading ledger vouchers...</p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-3xl border border-rose-200 p-6 text-center shadow-sm">
          <AlertCircle className="w-6 h-6 text-rose-600 mx-auto mb-2" />
          <p className="text-xs text-rose-600">{error}</p>
          <button
            onClick={onRefresh}
            className="mt-3 px-4 py-1.5 rounded-xl bg-purple-700 text-white text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      ) : transactions.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-10 text-center shadow-sm space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="font-serif-display text-base font-bold text-slate-900">
            No ledger entries found
          </h3>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            {searchQuery
              ? `No transactions match "${searchQuery}".`
              : 'Start by recording your first sale invoice, silk purchase, or weaver voucher.'}
          </p>
          <div className="flex justify-center gap-2 pt-1">
            <button
              onClick={onOpenNewTransaction}
              className="px-4 py-2 rounded-xl bg-purple-700 text-white font-bold text-xs shadow-sm"
            >
              + Record Transaction
            </button>
            <button
              onClick={onNavigateToNewParty}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50"
            >
              + New Party
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedTransactions.map(group => (
            <div key={group.rawDate} className="space-y-2">
              {/* Date Group Heading */}
              <div className="flex items-center gap-2 px-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  {group.dateLabel}
                </span>
                <span className="text-[10px] text-slate-300">&bull;</span>
                <span className="text-[10px] text-slate-400 font-medium">
                  {group.items.length} {group.items.length === 1 ? 'entry' : 'entries'}
                </span>
                <div className="flex-1 border-t border-slate-200/60 ml-2" />
              </div>

              {/* Transaction Cards */}
              <div className="space-y-2.5">
                {group.items.map(tx => (
                  <div
                    key={tx.id}
                    onClick={() => onSelectTransaction(tx)}
                    className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-sm hover:border-purple-300 hover:shadow-md transition-all cursor-pointer active:scale-[0.99] space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          {getTypeBadge(tx.type)}
                          <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {tx.invoice_number}
                          </span>
                        </div>
                        <h4 className="font-serif-display font-bold text-slate-900 text-sm truncate">
                          {tx.party_name}
                        </h4>
                        <p className="text-[11px] text-slate-400 truncate">
                          {tx.items && tx.items[0] ? tx.items[0].item_name : 'Textile / Saree Item'}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-sm sm:text-base text-slate-900">
                          {formatPaiseToINR(tx.grand_total_paise)}
                        </div>
                        <div className="mt-0.5">
                          {getStatusBadge(tx.status)}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" /> {tx.invoice_date}
                      </span>
                      {tx.pending_paise > 0 ? (
                        <span className="text-amber-700 font-medium">
                          Pending: <strong className="font-mono">{formatPaiseToINR(tx.pending_paise)}</strong>
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-medium">
                          Settled in Full
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating Action Button (FAB) on Mobile: + New Entry */}
      <div className="fixed bottom-6 right-5 z-40 flex flex-col items-end gap-2.5">
        <button
          onClick={onNavigateToNewParty}
          className="px-3 py-1.5 rounded-full bg-white text-slate-700 font-bold text-xs shadow-lg border border-slate-200 flex items-center gap-1.5 hover:bg-slate-50 transition-all"
        >
          <UserPlus className="w-3.5 h-3.5 text-purple-700" />
          <span className="hidden sm:inline">Add</span> Party
        </button>

        <button
          onClick={onOpenNewTransaction}
          className="px-4 py-3 rounded-full bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-xl flex items-center gap-2 hover:scale-105 active:scale-95 transition-all"
        >
          <Plus className="w-5 h-5" />
          <span>New Entry</span>
        </button>
      </div>
    </div>
  );
};

