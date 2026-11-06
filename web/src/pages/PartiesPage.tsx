import React, { useState, useEffect, useMemo } from 'react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import {
  Users,
  Plus,
  Search,
  Building2,
  Phone,
  MapPin,
  BookOpen,
  Edit,
  Eye,
  RefreshCw,
  ShoppingBag,
  Truck,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  X
} from 'lucide-react';
import { Party, PartyType, formatINR } from '@yorbalance/shared';
import { api } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { PartyFormModal } from '../components/parties/PartyFormModal';
import { PartyDetailsModal } from '../components/parties/PartyDetailsModal';

export const PartiesPage: React.FC = () => {
  const navigate = useNavigate();

  // Data State
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters State
  const [activeTab, setActiveTab] = useState<'ALL' | PartyType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Fetch parties from backend API
  const fetchParties = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getParties();
      setParties(res.parties || []);
    } catch (err: any) {
      console.error('Failed to load parties:', err);
      setError(err.message || 'Unable to retrieve parties list. Please check connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParties();
  }, []);

  // Filtered Parties calculation
  const filteredParties = useMemo(() => {
    return parties.filter(p => {
      // Tab filter
      if (activeTab !== 'ALL' && p.type !== activeTab) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesOwner = (p.owner_name || '').toLowerCase().includes(q);
        const matchesPhone = p.phone.includes(q) || (p.additional_phones || []).some(ap => ap.includes(q));
        const matchesGstin = (p.gstin || '').toLowerCase().includes(q);
        const matchesAddress = (p.address || '').toLowerCase().includes(q);
        return matchesName || matchesOwner || matchesPhone || matchesGstin || matchesAddress;
      }
      return true;
    });
  }, [parties, activeTab, searchQuery]);

  // Aggregate Metrics for Header Cards
  const stats = useMemo(() => {
    let customerCount = 0;
    let supplierCount = 0;
    let artisanCount = 0;
    let totalReceivables = 0;
    let totalPayables = 0;

    parties.forEach(p => {
      if (p.type === 'CUSTOMER') {
        customerCount++;
        if (p.current_balance && p.current_balance > 0) {
          totalReceivables += p.current_balance;
        }
      } else if (p.type === 'SUPPLIER') {
        supplierCount++;
        if (p.current_balance && p.current_balance > 0) {
          totalPayables += p.current_balance;
        }
      } else if (p.type === 'ARTISAN') {
        artisanCount++;
        if (p.current_balance && p.current_balance > 0) {
          totalPayables += p.current_balance;
        }
      }
    });

    return {
      total: parties.length,
      customerCount,
      supplierCount,
      artisanCount,
      totalReceivables,
      totalPayables
    };
  }, [parties]);

  // Action Handlers
  const handleOpenAddModal = () => {
    setEditingParty(null);
    setIsFormOpen(true);
  };

  const handleOpenEditModal = (party: Party) => {
    setEditingParty(party);
    setIsFormOpen(true);
  };

  const handleOpenDetails = (party: Party) => {
    setSelectedParty(party);
  };

  const handlePartySaved = (savedParty: Party) => {
    setNotification({
      message: editingParty
        ? `Party "${savedParty.name}" updated successfully.`
        : `New party "${savedParty.name}" registered successfully.`,
      type: 'success'
    });
    setTimeout(() => setNotification(null), 4000);
    fetchParties();
  };

  const handleOpenLedger = (party: Party) => {
    navigate(`/ledger?partyId=${party.id}`);
  };

  const getPartyBadge = (type: PartyType) => {
    switch (type) {
      case 'CUSTOMER':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <ShoppingBag className="w-3 h-3 text-blue-600" /> Customer
          </span>
        );
      case 'SUPPLIER':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <Truck className="w-3 h-3 text-purple-600" /> Supplier
          </span>
        );
      case 'ARTISAN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Sparkles className="w-3 h-3 text-amber-600" /> Artisan
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-50 text-slate-700 border border-slate-200">
            {type}
          </span>
        );
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Toast / Notification Banner */}
        {notification && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="p-1 rounded-lg text-emerald-600 hover:bg-emerald-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Page Top Heading & Add Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 tracking-wider uppercase">
                Directory & Balances
              </span>
              <span className="text-xs text-slate-400">&bull;</span>
              <span className="text-xs text-slate-500 font-medium">
                {stats.total} Total Registered Accounts
              </span>
            </div>
            <h1 className="font-serif-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
              Parties
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
              Manage buyers, raw silk suppliers, and handloom weavers with live ledger balances and contact directories.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchParties}
              disabled={loading}
              className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
              title="Refresh Parties"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-purple-600' : ''}`} />
            </button>
            <button
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-md hover:shadow-lg transition-all"
            >
              <Plus className="w-4 h-4" /> Add Party
            </button>
          </div>
        </div>

        {/* Aggregate KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Total Customers
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-bold font-serif-display text-slate-900">
                {stats.customerCount}
              </span>
              <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">
                Buyers
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Suppliers & Artisans
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-bold font-serif-display text-slate-900">
                {stats.supplierCount + stats.artisanCount}
              </span>
              <span className="text-[11px] font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-lg">
                Sellers/Weavers
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Receivables (To Collect)
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-lg sm:text-xl font-bold font-mono text-emerald-700">
                {formatINR(stats.totalReceivables)}
              </span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Payables (To Settle)
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-lg sm:text-xl font-bold font-mono text-amber-700">
                {formatINR(stats.totalPayables)}
              </span>
              <TrendingDown className="w-4 h-4 text-amber-600" />
            </div>
          </div>
        </div>

        {/* Filter Toolbar & Search Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between gap-4">
          {/* Segmented Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl overflow-x-auto">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'ALL'
                  ? 'bg-white text-purple-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Parties ({parties.length})
            </button>
            <button
              onClick={() => setActiveTab('CUSTOMER')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'CUSTOMER'
                  ? 'bg-white text-blue-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Customers ({stats.customerCount})
            </button>
            <button
              onClick={() => setActiveTab('SUPPLIER')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'SUPPLIER'
                  ? 'bg-white text-purple-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Suppliers ({stats.supplierCount})
            </button>
            <button
              onClick={() => setActiveTab('ARTISAN')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'ARTISAN'
                  ? 'bg-white text-amber-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Artisans ({stats.artisanCount})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by party, owner, mobile, GST..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Content View: Table or Cards */}
        {loading ? (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-3 animate-pulse">
              <Users className="w-6 h-6" />
            </div>
            <p className="text-xs font-bold text-slate-700">Loading parties & ledger balances...</p>
            <p className="text-[11px] text-slate-400 mt-1">Calculating verified transactions from PostgreSQL</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-3xl border border-rose-200 p-8 text-center shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="font-serif-display text-base font-bold text-slate-900">Failed to load parties</h3>
            <p className="text-xs text-rose-600 mt-1">{error}</p>
            <button
              onClick={fetchParties}
              className="mt-4 px-4 py-2 rounded-xl bg-purple-700 text-white font-semibold text-xs hover:bg-purple-800 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : filteredParties.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-3">
              <Building2 className="w-7 h-7" />
            </div>
            <h3 className="font-serif-display text-lg font-bold text-slate-900">No parties found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              {searchQuery
                ? `No records matching "${searchQuery}". Try clearing your search query.`
                : 'No parties recorded in this category yet. Register customers, silk filature suppliers, or weavers.'}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Clear Search
                </button>
              )}
              <button
                onClick={handleOpenAddModal}
                className="px-5 py-2 rounded-xl bg-purple-700 text-white font-bold text-xs hover:bg-purple-800 shadow-md transition-all"
              >
                + Register New Party
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block bg-white rounded-3xl border border-slate-200/80 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-3.5 px-6">Party / Business Name</th>
                      <th className="py-3.5 px-4">Owner Name</th>
                      <th className="py-3.5 px-4">Party Type</th>
                      <th className="py-3.5 px-4">Contact Mobile</th>
                      <th className="py-3.5 px-4">GSTIN</th>
                      <th className="py-3.5 px-4 text-right">Current Balance</th>
                      <th className="py-3.5 px-6 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredParties.map(p => {
                      const balance = p.current_balance || 0;
                      const hasAdditionals = p.additional_phones && p.additional_phones.length > 0;

                      return (
                        <tr
                          key={p.id}
                          className="hover:bg-purple-50/30 transition-colors group cursor-pointer"
                          onClick={() => handleOpenDetails(p)}
                        >
                          {/* Party Name */}
                          <td className="py-4 px-6">
                            <div className="font-bold text-slate-900 group-hover:text-purple-950 transition-colors flex items-center gap-1.5">
                              {p.name}
                              {p.notes && (
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-600" title="Has internal notes" />
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate max-w-xs flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">{p.address}, {p.state}</span>
                            </div>
                          </td>

                          {/* Owner Name */}
                          <td className="py-4 px-4 font-medium text-slate-700">
                            {p.owner_name}
                          </td>

                          {/* Party Type Badge */}
                          <td className="py-4 px-4">
                            {getPartyBadge(p.type)}
                          </td>

                          {/* Contact Mobile */}
                          <td className="py-4 px-4">
                            <div className="font-mono font-semibold text-slate-800">
                              {p.phone}
                            </div>
                            {hasAdditionals && (
                              <span className="inline-block mt-0.5 text-[10px] text-purple-700 font-bold bg-purple-50 px-1.5 py-0.5 rounded">
                                +{p.additional_phones!.length} more
                              </span>
                            )}
                          </td>

                          {/* GSTIN */}
                          <td className="py-4 px-4">
                            {p.gstin ? (
                              <span className="font-mono text-[11px] text-slate-700 font-medium bg-slate-100 px-2 py-0.5 rounded-md">
                                {p.gstin}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">
                                Unregistered
                              </span>
                            )}
                          </td>

                          {/* Current Balance */}
                          <td className="py-4 px-4 text-right">
                            <div className="font-mono font-bold text-sm">
                              {formatINR(balance)}
                            </div>
                            <div className="text-[10px] font-semibold">
                              {balance === 0 ? (
                                <span className="text-slate-400">Settled</span>
                              ) : p.type === 'CUSTOMER' ? (
                                <span className="text-emerald-600">To Receive</span>
                              ) : (
                                <span className="text-amber-600">To Pay</span>
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td
                            className="py-4 px-6 text-center"
                            onClick={e => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => handleOpenDetails(p)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-purple-700 hover:bg-purple-50 transition-colors"
                                title="View Party Details"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleOpenEditModal(p)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
                                title="Edit Party"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleOpenLedger(p)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold text-[11px] transition-colors"
                                title="Open Ledger"
                              >
                                <BookOpen className="w-3.5 h-3.5" /> Ledger
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {filteredParties.map(p => {
                const balance = p.current_balance || 0;

                return (
                  <div
                    key={p.id}
                    onClick={() => handleOpenDetails(p)}
                    className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3 active:scale-[0.99] transition-all cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          {getPartyBadge(p.type)}
                          {p.gstin && (
                            <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              GST
                            </span>
                          )}
                        </div>
                        <h3 className="font-serif-display font-bold text-slate-900 text-base mt-1.5">
                          {p.name}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium">
                          Prop: {p.owner_name}
                        </p>
                      </div>

                      <div className="text-right">
                        <div className="font-mono font-bold text-base text-slate-900">
                          {formatINR(balance)}
                        </div>
                        <span className={`text-[10px] font-bold ${
                          balance === 0 ? 'text-slate-400' : p.type === 'CUSTOMER' ? 'text-emerald-600' : 'text-amber-600'
                        }`}>
                          {balance === 0 ? 'Settled' : p.type === 'CUSTOMER' ? 'To Receive' : 'To Pay'}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <div className="flex items-center gap-1 font-mono font-medium">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{p.phone}</span>
                      </div>
                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleOpenEditModal(p)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 font-semibold text-[11px]"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleOpenLedger(p)}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-purple-700 text-white font-bold text-[11px]"
                        >
                          <BookOpen className="w-3 h-3" /> Ledger
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Add / Edit Party Modal */}
      <PartyFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSuccess={handlePartySaved}
        initialParty={editingParty}
      />

      {/* Party Full Details Modal */}
      <PartyDetailsModal
        party={selectedParty}
        isOpen={Boolean(selectedParty)}
        onClose={() => setSelectedParty(null)}
        onEdit={p => {
          setSelectedParty(null);
          handleOpenEditModal(p);
        }}
      />
    </DashboardLayout>
  );
};
