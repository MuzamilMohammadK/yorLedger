import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import {
  BookOpen,
  UserPlus,
  Bell,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  X,
  CheckCircle2
} from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Transaction,
  Party,
  LedgerSummary,
  PartyType
} from '@yorbalance/shared';
import { api } from '../lib/api';
import { LedgerListView } from '../components/ledger/LedgerListView';
import { NewPartyEntryView, NewPartyFormData } from '../components/ledger/NewPartyEntryView';
import { NewTransactionModal } from '../components/ledger/NewTransactionModal';
import { TransactionDetailsModal } from '../components/ledger/TransactionDetailsModal';

const DEFAULT_PARTY_FORM: NewPartyFormData = {
  type: 'CUSTOMER',
  name: '',
  ownerName: '',
  phone: '',
  additionalPhones: [],
  gstin: '',
  address: '',
  state: 'Andhra Pradesh (New)',
  pinCode: '',
  notes: ''
};

export const LedgerPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Screen View State: 'LEDGER' | 'NEW_PARTY'
  const [activeScreen, setActiveScreen] = useState<'LEDGER' | 'NEW_PARTY'>('LEDGER');

  // Query Param Context: partyId
  const partyIdParam = searchParams.get('partyId');

  // Ledger Data State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<LedgerSummary>({
    total_receivable: 0,
    total_payable: 0,
    total_transactions: 0
  });
  const [parties, setParties] = useState<Party[]>([]);
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [activeTypeFilter, setActiveTypeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Persistent New Party Form State
  const [newPartyForm, setNewPartyForm] = useState<NewPartyFormData>(DEFAULT_PARTY_FORM);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [pendingNavigationTarget, setPendingNavigationTarget] = useState<'LEDGER' | null>(null);

  // Modals
  const [isNewTxModalOpen, setIsNewTxModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [preselectedPartyIdForTx, setPreselectedPartyIdForTx] = useState<string | null>(null);

  // Swipe Gesture Handling Refs
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartTimeRef = useRef<number>(0);
  const isInputTouchRef = useRef<boolean>(false);

  // Check if form is dirty
  const isFormDirty = useMemo(() => {
    return (
      newPartyForm.name.trim() !== '' ||
      newPartyForm.ownerName.trim() !== '' ||
      newPartyForm.phone.trim() !== '' ||
      newPartyForm.additionalPhones.some(p => p.trim() !== '') ||
      newPartyForm.gstin.trim() !== '' ||
      newPartyForm.address.trim() !== '' ||
      newPartyForm.pinCode.trim() !== '' ||
      newPartyForm.notes.trim() !== ''
    );
  }, [newPartyForm]);

  // Fetch Ledger data & parties
  const fetchLedgerData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch parties
      const partiesRes = await api.getParties();
      setParties(partiesRes.parties || []);

      // Fetch transactions with current filters
      const ledgerRes = await api.getLedgerTransactions({
        party_id: partyIdParam || undefined,
        type: activeTypeFilter !== 'ALL' ? activeTypeFilter : undefined,
        search: searchQuery || undefined
      });

      setTransactions(ledgerRes.transactions || []);
      setSummary(ledgerRes.summary || { total_receivable: 0, total_payable: 0, total_transactions: 0 });

      if (partyIdParam) {
        const found = partiesRes.parties.find(p => p.id === partyIdParam);
        setSelectedParty(found || ledgerRes.party || null);
      } else {
        setSelectedParty(null);
      }
    } catch (err: any) {
      console.error('Failed to load ledger data:', err);
      setError(err.message || 'Unable to retrieve ledger transactions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedgerData();
  }, [partyIdParam, activeTypeFilter, searchQuery]);

  // Request screen transition with dirty check
  const handleRequestScreenChange = (target: 'LEDGER' | 'NEW_PARTY') => {
    if (activeScreen === target) return;

    if (activeScreen === 'NEW_PARTY' && target === 'LEDGER' && isFormDirty) {
      setShowDiscardConfirm(true);
      setPendingNavigationTarget('LEDGER');
      return;
    }

    setActiveScreen(target);
  };

  const handleConfirmDiscard = () => {
    setNewPartyForm(DEFAULT_PARTY_FORM);
    setShowDiscardConfirm(false);
    setPendingNavigationTarget(null);
    setActiveScreen('LEDGER');
  };

  const handleCancelDiscard = () => {
    setShowDiscardConfirm(false);
    setPendingNavigationTarget(null);
  };

  // Swipe Gestures: must not interfere with vertical scroll or form controls
  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    // Ignore touch starting inside inputs, textareas, buttons, selects
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'BUTTON' ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('button') ||
      target.closest('[data-no-swipe]')
    ) {
      isInputTouchRef.current = true;
      return;
    }

    isInputTouchRef.current = false;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    touchStartTimeRef.current = Date.now();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isInputTouchRef.current) return;
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const dx = touchEndX - touchStartXRef.current;
    const dy = touchEndY - touchStartYRef.current;
    const duration = Date.now() - touchStartTimeRef.current;

    // Reset touch coordinates
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    // Validate horizontal gesture: dx > 60px, horizontal exceeds vertical, fast enough
    if (Math.abs(dx) > 60 && Math.abs(dx) > 1.8 * Math.abs(dy) && duration < 600) {
      if (activeScreen === 'LEDGER' && dx < -60) {
        // Swipe left on Ledger -> open New Party Entry
        handleRequestScreenChange('NEW_PARTY');
      } else if (activeScreen === 'NEW_PARTY' && dx > 60) {
        // Swipe right on New Party Entry -> return to Ledger
        handleRequestScreenChange('LEDGER');
      }
    }
  };

  // Post-Save actions from NewPartyEntryView
  const handlePartySaved = (party: Party, action: 'open_ledger' | 'add_transaction' | 'add_another') => {
    setParties(prev => [party, ...prev]);

    if (action === 'open_ledger') {
      setNewPartyForm(DEFAULT_PARTY_FORM);
      setSearchParams({ partyId: party.id });
      setActiveScreen('LEDGER');
      setToastMessage(`Showing ledger for ${party.name}`);
      setTimeout(() => setToastMessage(null), 4000);
    } else if (action === 'add_transaction') {
      setNewPartyForm(DEFAULT_PARTY_FORM);
      setPreselectedPartyIdForTx(party.id);
      setIsNewTxModalOpen(true);
      setActiveScreen('LEDGER');
    } else if (action === 'add_another') {
      setNewPartyForm(DEFAULT_PARTY_FORM);
      setToastMessage(`Party "${party.name}" registered. Ready for next entry.`);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  // Clear focused party filter
  const handleClearPartyFilter = () => {
    searchParams.delete('partyId');
    setSearchParams(searchParams);
  };

  // Handle recorded transaction success
  const handleTransactionCreated = (newTx: Transaction) => {
    setTransactions(prev => [newTx, ...prev]);
    setToastMessage(`Transaction #${newTx.invoice_number} recorded successfully.`);
    setTimeout(() => setToastMessage(null), 4000);
    fetchLedgerData();
  };

  return (
    <DashboardLayout>
      <div
        className="space-y-4 touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Toast Alert */}
        {toastMessage && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{toastMessage}</span>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="p-1 rounded-lg text-emerald-600 hover:bg-emerald-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Top Header & Branding Bar */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-800 to-indigo-900 text-white flex items-center justify-center font-bold text-sm shadow-md">
              YL
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">
                  YorLedger Mobile
                </span>
                <span className="text-[10px] text-slate-300">&bull;</span>
                <span className="text-[10px] text-slate-400 font-medium">Swipe Enabled</span>
              </div>
              <h1 className="font-serif-display text-xl sm:text-2xl font-bold text-slate-900 leading-tight">
                Ledger & Party Entry
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="w-9 h-9 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center justify-center transition-colors relative"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="w-2 h-2 rounded-full bg-purple-600 absolute top-2 right-2 ring-2 ring-white" />
            </button>
          </div>
        </div>

        {/* Visible Synchronized Navigation Tabs with Swipe Prompts */}
        <div className="bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between relative">
          <div className="grid grid-cols-2 gap-1.5 w-full">
            <button
              type="button"
              onClick={() => handleRequestScreenChange('LEDGER')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                activeScreen === 'LEDGER'
                  ? 'bg-purple-900 text-white shadow-sm ring-2 ring-purple-900/10'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Ledger</span>
              {activeScreen === 'LEDGER' && (
                <span className="hidden sm:inline-block text-[10px] font-normal opacity-80">
                  (Swipe left to Add Party →)
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleRequestScreenChange('NEW_PARTY')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                activeScreen === 'NEW_PARTY'
                  ? 'bg-purple-900 text-white shadow-sm ring-2 ring-purple-900/10'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>+ New Party</span>
              {activeScreen === 'NEW_PARTY' && (
                <span className="hidden sm:inline-block text-[10px] font-normal opacity-80">
                  (← Swipe right to Ledger)
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Swipe Indicator Bar */}
        <div className="flex items-center justify-between px-3 text-[11px] text-slate-400 sm:hidden">
          <span className="flex items-center gap-1">
            {activeScreen === 'LEDGER' ? (
              <>
                <span>Swipe left for New Party</span>
                <ChevronRight className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
              </>
            ) : (
              <>
                <ChevronLeft className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
                <span>Swipe right for Ledger</span>
              </>
            )}
          </span>
          <span className="font-semibold text-purple-700">
            Screen {activeScreen === 'LEDGER' ? '1 of 2' : '2 of 2'}
          </span>
        </div>

        {/* Main Swipeable Screen View Container */}
        <div className="relative overflow-hidden transition-all duration-300 ease-out">
          {activeScreen === 'LEDGER' ? (
            <LedgerListView
              transactions={transactions}
              summary={summary}
              loading={loading}
              error={error}
              onRefresh={fetchLedgerData}
              selectedParty={selectedParty}
              onClearPartyFilter={handleClearPartyFilter}
              activeTypeFilter={activeTypeFilter}
              onTypeFilterChange={setActiveTypeFilter}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onSelectTransaction={tx => setSelectedTx(tx)}
              onOpenNewTransaction={() => {
                setPreselectedPartyIdForTx(selectedParty ? selectedParty.id : null);
                setIsNewTxModalOpen(true);
              }}
              onNavigateToNewParty={() => handleRequestScreenChange('NEW_PARTY')}
            />
          ) : (
            <NewPartyEntryView
              formData={newPartyForm}
              onFormChange={setNewPartyForm}
              onCancel={() => handleRequestScreenChange('LEDGER')}
              onSuccess={handlePartySaved}
            />
          )}
        </div>
      </div>

      {/* Discard Unsaved Changes Confirmation Modal */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 text-center space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-serif-display text-lg font-bold text-slate-900">
                Discard Unsaved Party Details?
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                You have started entering information for a new party. Navigating away now will discard your entries.
              </p>
            </div>
            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleCancelDiscard}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={handleConfirmDiscard}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md transition-all"
              >
                Discard & Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Transaction Entry Modal */}
      <NewTransactionModal
        isOpen={isNewTxModalOpen}
        onClose={() => setIsNewTxModalOpen(false)}
        onSuccess={handleTransactionCreated}
        parties={parties}
        preselectedPartyId={preselectedPartyIdForTx}
        onNavigateToNewParty={() => {
          setIsNewTxModalOpen(false);
          handleRequestScreenChange('NEW_PARTY');
        }}
      />

      {/* Transaction Details Modal */}
      <TransactionDetailsModal
        transaction={selectedTx}
        isOpen={Boolean(selectedTx)}
        onClose={() => setSelectedTx(null)}
        onOpenPartyLedger={partyId => {
          setSelectedTx(null);
          setSearchParams({ partyId });
        }}
      />
    </DashboardLayout>
  );
};
