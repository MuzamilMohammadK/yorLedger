import {
  Shop,
  ShopVerification,
  RegisterShopPayload,
  ResubmitShopPayload,
  User,
  Transaction,
  Party,
  PartyType,
  CreatePartyPayload,
  UpdatePartyPayload,
  DuplicatePartyCheckResult,
  CreateTransactionPayload,
  LedgerSummary,
  LedgerFilterOptions,
  DashboardSummary,
  DashboardCharts,
  DateRangeOption,
  PaymentRecord,
  ReturnRecord,
  RecordPaymentPayload,
  RecordReturnPayload,
  HistorySummary,
  HistoryFilterOptions,
  DuesSummary,
  DueRecord,
  DuesFilterOptions,
  ReportFilterOptions,
  PurchaseLedgerReport,
  PurchaseLedgerItem,
  SalesLedgerReport,
  SalesLedgerItem,
  ArtisanJobWorkReport,
  ArtisanJobWorkItem,
  ArtisanSummary,
  GSTDashboardData,
  ShopSettingsData,
  InvoiceSettings,
  NotificationSettings,
  AppPreferences,
  UpdateShopProfilePayload,
  UpdateGSTSettingsPayload,
  PaymentStatus
} from '@yorbalance/shared';
import { calculateSummary, calculateCharts } from './analytics';
import { cache } from './cache';

// Read-side calculations shared by Dashboard, Parties, Ledger, History, Dues and Reports.
// Data comes from the live Firestore cache (./cache), never from sample data.
const loadTransactions = (_shopId: string) => cache.transactions();
const loadParties = (_shopId: string) => cache.parties();
const loadPayments = (_shopId: string) => cache.payments();
const loadReturns = (_shopId: string) => cache.returns();

function resolveReportDateRange(options?: ReportFilterOptions): { from: string; to: string; label: string } {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  if (options?.from && options?.to) {
    return { from: options.from, to: options.to, label: `${options.from} to ${options.to}` };
  }

  if (options?.month) {
    const [yStr, mStr] = options.month.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const lastDay = new Date(y, m, 0).getDate();
    const from = `${yStr}-${mStr.padStart(2, '0')}-01`;
    const to = `${yStr}-${mStr.padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { from, to, label: `Month: ${options.month}` };
  }

  if (options?.quarter) {
    let fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
    if (options.financialYear) {
      const parts = options.financialYear.split('-');
      if (parts[0]) fyStartYear = parseInt(parts[0], 10);
    }

    if (options.quarter === 'Q1') {
      return { from: `${fyStartYear}-04-01`, to: `${fyStartYear}-06-30`, label: `Q1 (Apr - Jun ${fyStartYear})` };
    } else if (options.quarter === 'Q2') {
      return { from: `${fyStartYear}-07-01`, to: `${fyStartYear}-09-30`, label: `Q2 (Jul - Sep ${fyStartYear})` };
    } else if (options.quarter === 'Q3') {
      return { from: `${fyStartYear}-10-01`, to: `${fyStartYear}-12-31`, label: `Q3 (Oct - Dec ${fyStartYear})` };
    } else if (options.quarter === 'Q4') {
      return { from: `${fyStartYear + 1}-01-01`, to: `${fyStartYear + 1}-03-31`, label: `Q4 (Jan - Mar ${fyStartYear + 1})` };
    }
  }

  if (options?.financialYear) {
    const parts = options.financialYear.split('-');
    const fyStartYear = parseInt(parts[0], 10) || currentYear;
    return {
      from: `${fyStartYear}-04-01`,
      to: `${fyStartYear + 1}-03-31`,
      label: `FY ${options.financialYear}`
    };
  }

  if (options?.from) {
    return { from: options.from, to: '9999-12-31', label: `From ${options.from}` };
  }
  if (options?.to) {
    return { from: '1970-01-01', to: options.to, label: `Up to ${options.to}` };
  }

  const defaultFyStart = currentMonth >= 3 ? currentYear : currentYear - 1;
  return {
    from: `${defaultFyStart}-04-01`,
    to: `${defaultFyStart + 1}-03-31`,
    label: `FY ${defaultFyStart}-${defaultFyStart + 1}`
  };
}

function enrichClientPartyWithBalance(party: Party, transactions: Transaction[]): Party {
  const partyTxs = transactions.filter(t => t.party_id === party.id);
  const totalPendingPaise = partyTxs.reduce((sum, t) => sum + (t.pending_paise || 0), 0);
  const amountRupees = Math.round(totalPendingPaise / 100);

  let balance_type: 'RECEIVABLE' | 'PAYABLE' | 'SETTLED' = 'SETTLED';
  if (amountRupees > 0) {
    balance_type = party.type === 'CUSTOMER' ? 'RECEIVABLE' : 'PAYABLE';
  }

  return {
    ...party,
    current_balance: amountRupees,
    balance_type
  };
}

export const compute = {
  getDashboardSummary(shopId: string, period?: DateRangeOption): DashboardSummary {
    const txs = loadTransactions(shopId);
    return calculateSummary(txs, period || 'this_month');
  },

  getDashboardCharts(shopId: string, period?: DateRangeOption): DashboardCharts {
    const txs = loadTransactions(shopId);
    return calculateCharts(txs, period || 'this_month');
  },

  getRecentTransactions(shopId: string, limit = 10, search?: string): Transaction[] {
    let txs = loadTransactions(shopId);
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      txs = txs.filter(t =>
        t.invoice_number.toLowerCase().includes(q) ||
        t.party_name.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q)
      );
    }
    txs = [...txs].sort((a, b) => b.invoice_date.localeCompare(a.invoice_date));
    return txs.slice(0, limit);
  },

  getTransactionById(shopId: string, transactionId: string): Transaction | null {
    const txs = loadTransactions(shopId);
    return txs.find(t => t.id === transactionId) || null;
  },

  // Phase 3 Party Management
  getParties(shopId: string, type?: PartyType, search?: string): Party[] {
    let parties = loadParties(shopId);
    const txs = loadTransactions(shopId);

    if (type) {
      parties = parties.filter(p => p.type === type);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      parties = parties.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.owner_name && p.owner_name.toLowerCase().includes(q)) ||
        p.phone.includes(q) ||
        (p.gstin && p.gstin.toLowerCase().includes(q)) ||
        (p.address && p.address.toLowerCase().includes(q))
      );
    }

    const enriched = parties.map(p => enrichClientPartyWithBalance(p, txs));
    return enriched.sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  getPartyById(shopId: string, partyId: string): Party | null {
    const parties = loadParties(shopId);
    const found = parties.find(p => p.id === partyId);
    if (!found) return null;
    const txs = loadTransactions(shopId);
    return enrichClientPartyWithBalance(found, txs);
  },

  checkDuplicateParty(shopId: string, phone: string, gstin?: string, excludePartyId?: string): DuplicatePartyCheckResult {
    const parties = loadParties(shopId);
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    for (const p of parties) {
      if (excludePartyId && p.id === excludePartyId) continue;

      const pPhone = p.phone.replace(/\D/g, '').slice(-10);
      const pAlt = (p.additional_phones || []).map(num => num.replace(/\D/g, '').slice(-10));

      if (cleanPhone && (pPhone === cleanPhone || pAlt.includes(cleanPhone))) {
        return {
          isDuplicate: true,
          field: 'phone',
          existingParty: p,
          message: `A party named '${p.name}' is already registered with mobile number ${phone}.`
        };
      }

      if (gstin && p.gstin && p.gstin.trim().toUpperCase() === gstin.trim().toUpperCase()) {
        return {
          isDuplicate: true,
          field: 'gstin',
          existingParty: p,
          message: `A party named '${p.name}' is already registered with GSTIN ${gstin.toUpperCase()}.`
        };
      }
    }

    return { isDuplicate: false };
  },

  getLedgerTransactions(shopId: string, options?: LedgerFilterOptions): { transactions: Transaction[]; summary: LedgerSummary } {
    let txs = loadTransactions(shopId);
    const parties = loadParties(shopId);

    const partyPhoneMap = new Map<string, string>();
    parties.forEach(p => {
      const allPhones = [p.phone, ...(p.additional_phones || [])].join(' ');
      partyPhoneMap.set(p.id, allPhones);
    });

    if (options?.partyId) {
      txs = txs.filter(t => t.party_id === options.partyId);
    }

    if (options?.type && options.type !== 'ALL') {
      if (options.type === 'PAYMENT') {
        txs = txs.filter(t => t.paid_paise > 0 || t.status === 'SETTLED');
      } else {
        txs = txs.filter(t => t.type === options.type);
      }
    }

    if (options?.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      txs = txs.filter(t => {
        const partyPhones = partyPhoneMap.get(t.party_id) || '';
        return (
          t.party_name.toLowerCase().includes(q) ||
          t.invoice_number.toLowerCase().includes(q) ||
          partyPhones.includes(q) ||
          t.type.toLowerCase().includes(q)
        );
      });
    }

    const total_receivable = Math.round(
      txs
        .filter(t => t.party_type === 'CUSTOMER' || t.type === 'SALE')
        .reduce((sum, t) => sum + (t.pending_paise || 0), 0) / 100
    );

    const total_payable = Math.round(
      txs
        .filter(t => t.party_type !== 'CUSTOMER' || t.type === 'PURCHASE' || t.type === 'JOB_WORK')
        .reduce((sum, t) => sum + (t.pending_paise || 0), 0) / 100
    );

    const sorted = [...txs].sort((a, b) => b.invoice_date.localeCompare(a.invoice_date));
    const limit = options?.limit || 100;

    return {
      transactions: sorted.slice(0, limit),
      summary: {
        total_receivable,
        total_payable,
        total_transactions: sorted.length
      }
    };
  },

  getHistory(shopId: string, options?: HistoryFilterOptions): { transactions: any[]; summary: HistorySummary; total: number } {
    const txs = loadTransactions(shopId);
    const payments = loadPayments(shopId);
    const returns = loadReturns(shopId);
    const parties = loadParties(shopId);

    const partyPhoneMap = new Map<string, string>();
    parties.forEach(p => {
      const allPhones = [p.phone, ...(p.additional_phones || [])].join(' ');
      partyPhoneMap.set(p.id, allPhones);
    });

    const filterByDate = (dateStr: string) => {
      if (!dateStr) return true;
      if (options?.startDate && dateStr < options.startDate) return false;
      if (options?.endDate && dateStr > options.endDate) return false;
      if (options?.dateRange && options.dateRange !== 'all') {
        const now = new Date();
        const d = new Date(dateStr);
        if (options.dateRange === 'today') {
          return dateStr === now.toISOString().split('T')[0];
        } else if (options.dateRange === 'this_week') {
          const weekAgo = new Date(now.getTime() - 7 * 86400000);
          return d >= weekAgo;
        } else if (options.dateRange === 'this_month') {
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        } else if (options.dateRange === 'this_fy') {
          const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
          const fyStart = new Date(fyStartYear, 3, 1);
          const fyEnd = new Date(fyStartYear + 1, 2, 31, 23, 59, 59);
          return d >= fyStart && d <= fyEnd;
        }
      }
      return true;
    };

    const filteredSummaryTxs = txs.filter(t => filterByDate(t.invoice_date));
    const filteredSummaryPayments = payments.filter(p => filterByDate(p.payment_date));
    const filteredSummaryReturns = returns.filter(r => filterByDate(r.return_date));

    const summary: HistorySummary = {
      total_sales: Math.round(filteredSummaryTxs.filter(t => t.type === 'SALE').reduce((sum, t) => sum + t.grand_total_paise, 0) / 100),
      total_purchases: Math.round(filteredSummaryTxs.filter(t => t.type === 'PURCHASE').reduce((sum, t) => sum + t.grand_total_paise, 0) / 100),
      total_job_work: Math.round(filteredSummaryTxs.filter(t => t.type === 'JOB_WORK').reduce((sum, t) => sum + t.grand_total_paise, 0) / 100),
      total_payments: Math.round(filteredSummaryPayments.reduce((sum, p) => sum + p.amount_paise, 0) / 100),
      total_returns: Math.round(filteredSummaryReturns.reduce((sum, r) => sum + r.amount_paise, 0) / 100),
    };

    let items: any[] = [];

    if (!options?.type || options.type === 'ALL' || ['SALE', 'PURCHASE', 'JOB_WORK'].includes(options.type)) {
      let tList = txs;
      if (options?.type && options.type !== 'ALL') {
        tList = tList.filter(t => t.type === options.type);
      }
      items.push(...tList.map(t => {
        const remainingPaise = Math.max(0, t.grand_total_paise - (t.return_paise || 0) - t.paid_paise);
        let status = t.status;
        if (remainingPaise === 0) status = 'SETTLED';
        else if (t.due_date && new Date(t.due_date).getTime() < Date.now()) status = 'OVERDUE';
        else if (t.paid_paise > 0 || (t.return_paise && t.return_paise > 0)) status = 'PARTIAL';
        else status = 'PENDING';

        return {
          id: t.id,
          item_kind: 'TRANSACTION',
          type: t.type,
          invoice_number: t.invoice_number,
          invoice_date: t.invoice_date,
          due_date: t.due_date || null,
          party_id: t.party_id,
          party_name: t.party_name,
          party_type: t.party_type,
          grand_total_paise: t.grand_total_paise,
          amount_rupees: Math.round(t.grand_total_paise / 100),
          paid_paise: t.paid_paise,
          paid_rupees: Math.round(t.paid_paise / 100),
          return_paise: t.return_paise || 0,
          return_rupees: Math.round((t.return_paise || 0) / 100),
          pending_paise: remainingPaise,
          remaining_due_rupees: Math.round(remainingPaise / 100),
          status,
          subtotal_paise: t.subtotal_paise,
          tax_paise: t.tax_paise,
          cgst_paise: t.cgst_paise,
          sgst_paise: t.sgst_paise,
          igst_paise: t.igst_paise,
          notes: t.notes,
          items: t.items || [],
          payments: t.payments || [],
          returns: t.returns || [],
          created_at: t.created_at
        };
      }));
    }

    if (!options?.type || options.type === 'ALL' || options.type === 'PAYMENT') {
      items.push(...payments.map(p => ({
        id: p.id,
        item_kind: 'PAYMENT',
        type: 'PAYMENT',
        invoice_number: p.reference_number || (p.cheque_number ? `CHQ-${p.cheque_number}` : `RCP-${p.id.slice(-6).toUpperCase()}`),
        invoice_date: p.payment_date,
        due_date: null,
        party_id: p.party_id,
        party_name: p.party_name || 'Party',
        party_type: p.party_type || 'CUSTOMER',
        grand_total_paise: p.amount_paise,
        amount_rupees: p.amount_rupees,
        paid_paise: p.amount_paise,
        paid_rupees: p.amount_rupees,
        return_paise: 0,
        return_rupees: 0,
        pending_paise: 0,
        remaining_due_rupees: 0,
        status: 'SETTLED',
        subtotal_paise: p.amount_paise,
        tax_paise: 0,
        cgst_paise: 0,
        sgst_paise: 0,
        igst_paise: 0,
        notes: p.notes,
        payment_mode: p.payment_mode,
        reference_number: p.reference_number,
        cheque_number: p.cheque_number,
        transaction_id: p.transaction_id,
        created_at: p.created_at
      })));
    }

    if (!options?.type || options.type === 'ALL' || options.type === 'RETURN') {
      items.push(...returns.map(r => {
        const parentTx = txs.find(t => t.id === r.transaction_id);
        return {
          id: r.id,
          item_kind: 'RETURN',
          type: 'RETURN',
          invoice_number: `RET-${r.id.slice(-6).toUpperCase()}`,
          invoice_date: r.return_date,
          due_date: null,
          party_id: r.party_id,
          party_name: parentTx?.party_name || 'Party',
          party_type: parentTx?.party_type || 'CUSTOMER',
          grand_total_paise: r.amount_paise,
          amount_rupees: r.amount_rupees,
          paid_paise: 0,
          paid_rupees: 0,
          return_paise: r.amount_paise,
          return_rupees: r.amount_rupees,
          pending_paise: 0,
          remaining_due_rupees: 0,
          status: 'SETTLED',
          subtotal_paise: r.amount_paise,
          tax_paise: 0,
          cgst_paise: 0,
          sgst_paise: 0,
          igst_paise: 0,
          notes: r.reason,
          transaction_id: r.transaction_id,
          created_at: r.created_at
        };
      }));
    }

    if (options?.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      items = items.filter(it => {
        const phones = partyPhoneMap.get(it.party_id) || '';
        return (
          (it.party_name && it.party_name.toLowerCase().includes(q)) ||
          (it.invoice_number && it.invoice_number.toLowerCase().includes(q)) ||
          phones.includes(q)
        );
      });
    }

    items = items.filter(it => filterByDate(it.invoice_date));

    if (options?.partyId) {
      items = items.filter(it => it.party_id === options.partyId);
    }

    if (options?.status && options.status !== 'ALL') {
      items = items.filter(it => it.status === options.status);
    }

    if (options?.minAmount !== undefined) {
      items = items.filter(it => it.amount_rupees >= (options.minAmount || 0));
    }
    if (options?.maxAmount !== undefined) {
      items = items.filter(it => it.amount_rupees <= (options.maxAmount || 0));
    }

    items.sort((a, b) => b.invoice_date.localeCompare(a.invoice_date) || b.created_at.localeCompare(a.created_at));

    const total = items.length;
    const offset = options?.offset || 0;
    const limit = options?.limit || 100;
    const pagedItems = items.slice(offset, offset + limit);

    return {
      transactions: pagedItems,
      summary,
      total
    };
  },

  getTransactionHistoryDetails(shopId: string, transactionId: string): Transaction | null {
    const txs = loadTransactions(shopId);
    const t = txs.find(tx => tx.id === transactionId && tx.shop_id === shopId);
    if (!t) return null;

    const payments = loadPayments(shopId).filter(p => p.transaction_id === transactionId);
    const returns = loadReturns(shopId).filter(r => r.transaction_id === transactionId);

    const remainingPaise = Math.max(0, t.grand_total_paise - (t.return_paise || 0) - t.paid_paise);
    let status = t.status;
    if (remainingPaise === 0) status = 'SETTLED';
    else if (t.due_date && new Date(t.due_date).getTime() < Date.now()) status = 'OVERDUE';
    else if (t.paid_paise > 0 || (t.return_paise && t.return_paise > 0)) status = 'PARTIAL';
    else status = 'PENDING';

    return {
      ...t,
      status,
      payments,
      returns
    };
  },

  getDuesSummary(shopId: string): DuesSummary {
    const txs = loadTransactions(shopId);
    let total_receivable = 0;
    let total_payable = 0;
    let overdue_receivable = 0;
    let overdue_payable = 0;

    for (const t of txs) {
      const returnPaise = t.return_paise || 0;
      const remainingPaise = Math.max(0, t.grand_total_paise - returnPaise - t.paid_paise);
      const remainingRupees = Math.round(remainingPaise / 100);
      if (remainingRupees <= 0) continue;

      let status = t.status;
      if (t.due_date && new Date(t.due_date).getTime() < Date.now()) {
        status = 'OVERDUE';
      }

      const isCustomer = t.party_type === 'CUSTOMER' || t.type === 'SALE';

      if (isCustomer) {
        total_receivable += remainingRupees;
        if (status === 'OVERDUE') overdue_receivable += remainingRupees;
      } else {
        total_payable += remainingRupees;
        if (status === 'OVERDUE') overdue_payable += remainingRupees;
      }
    }

    return {
      total_receivable,
      total_payable,
      overdue_receivable,
      overdue_payable
    };
  },

  getDues(shopId: string, options?: DuesFilterOptions): { dues: DueRecord[]; summary: DuesSummary; total: number } {
    const txs = loadTransactions(shopId);
    const parties = loadParties(shopId);

    const partyPhoneMap = new Map<string, string>();
    parties.forEach(p => {
      const allPhones = [p.phone, ...(p.additional_phones || [])].join(' ');
      partyPhoneMap.set(p.id, allPhones);
    });

    const duesList: DueRecord[] = [];

    for (const t of txs) {
      const original_amount = Math.round(t.grand_total_paise / 100);
      const returns = Math.round((t.return_paise || 0) / 100);
      const amount_paid = Math.round(t.paid_paise / 100);
      const remaining_due = Math.max(0, original_amount - returns - amount_paid);

      let status: 'PENDING' | 'PARTIAL' | 'OVERDUE' | 'SETTLED' = 'PENDING';
      if (remaining_due === 0) {
        status = 'SETTLED';
      } else if (t.due_date && new Date(t.due_date).getTime() < Date.now()) {
        status = 'OVERDUE';
      } else if (amount_paid > 0 || returns > 0) {
        status = 'PARTIAL';
      } else {
        status = 'PENDING';
      }

      duesList.push({
        id: t.id,
        party_id: t.party_id,
        party_name: t.party_name,
        party_type: t.party_type,
        invoice_number: t.invoice_number,
        invoice_date: t.invoice_date,
        due_date: t.due_date || null,
        original_amount,
        returns,
        amount_paid,
        remaining_due,
        status,
        type: t.type
      });
    }

    const summary = this.getDuesSummary(shopId);

    let filtered = duesList;

    if (options?.view === 'RECEIVABLE') {
      filtered = filtered.filter(d => d.party_type === 'CUSTOMER' || d.type === 'SALE');
    } else if (options?.view === 'PAYABLE') {
      filtered = filtered.filter(d => d.party_type !== 'CUSTOMER' || d.type === 'PURCHASE' || d.type === 'JOB_WORK');
    }

    if (options?.status && options.status !== 'ALL') {
      filtered = filtered.filter(d => d.status === options.status);
    } else if (!options?.status) {
      filtered = filtered.filter(d => d.remaining_due > 0);
    }

    if (options?.partyType && options.partyType !== 'ALL') {
      filtered = filtered.filter(d => d.party_type === options.partyType);
    }

    if (options?.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      filtered = filtered.filter(d => {
        const phones = partyPhoneMap.get(d.party_id) || '';
        return (
          d.party_name.toLowerCase().includes(q) ||
          d.invoice_number.toLowerCase().includes(q) ||
          phones.includes(q)
        );
      });
    }

    if (options?.invoiceStartDate) {
      filtered = filtered.filter(d => d.invoice_date >= options.invoiceStartDate!);
    }
    if (options?.invoiceEndDate) {
      filtered = filtered.filter(d => d.invoice_date <= options.invoiceEndDate!);
    }
    if (options?.dueStartDate) {
      filtered = filtered.filter(d => !!d.due_date && d.due_date >= options.dueStartDate!);
    }
    if (options?.dueEndDate) {
      filtered = filtered.filter(d => !!d.due_date && d.due_date <= options.dueEndDate!);
    }

    if (options?.minAmount !== undefined) {
      filtered = filtered.filter(d => d.remaining_due >= options.minAmount!);
    }
    if (options?.maxAmount !== undefined) {
      filtered = filtered.filter(d => d.remaining_due <= options.maxAmount!);
    }

    filtered.sort((a, b) => {
      if (a.status === 'OVERDUE' && b.status !== 'OVERDUE') return -1;
      if (b.status === 'OVERDUE' && a.status !== 'OVERDUE') return 1;
      return b.invoice_date.localeCompare(a.invoice_date);
    });

    return {
      dues: filtered,
      summary,
      total: filtered.length
    };
  },

  getDueById(shopId: string, transactionId: string): DueRecord | null {
    const { dues } = this.getDues(shopId, { status: 'ALL', view: 'ALL' });
    return dues.find(d => d.id === transactionId) || null;
  },

  getPurchaseLedger(shopId: string, options?: ReportFilterOptions): PurchaseLedgerReport {
    const txs = loadTransactions(shopId);
    const parties = loadParties(shopId);
    const dateRange = resolveReportDateRange(options);

    let purchaseTxs = txs.filter(t => t.type === 'PURCHASE' && t.invoice_date >= dateRange.from && t.invoice_date <= dateRange.to);

    if (options?.partyId) {
      purchaseTxs = purchaseTxs.filter(t => t.party_id === options.partyId);
    }
    if (options?.partySearch && options.partySearch.trim()) {
      const q = options.partySearch.trim().toLowerCase();
      purchaseTxs = purchaseTxs.filter(t =>
        t.party_name.toLowerCase().includes(q) ||
        t.invoice_number.toLowerCase().includes(q)
      );
    }

    const items: PurchaseLedgerItem[] = [];
    let total_purchase_value = 0;
    let total_taxable_value = 0;
    let total_cgst = 0;
    let total_sgst = 0;
    let total_igst = 0;
    let total_gst = 0;
    let total_returns = 0;
    let eligible_itc = 0;

    for (const t of purchaseTxs) {
      const party = parties.find(p => p.id === t.party_id);
      const supplierGstin = party?.gstin || null;
      const has_gstin = Boolean(supplierGstin && supplierGstin.trim().length === 15);

      const taxable_value = Math.round(t.subtotal_paise / 100);
      const cgst = Math.round(t.cgst_paise / 100);
      const sgst = Math.round(t.sgst_paise / 100);
      const igst = Math.round(t.igst_paise / 100);
      const bill_gst = cgst + sgst + igst;
      const returns = Math.round((t.return_paise || 0) / 100);
      const net_purchase_amount = Math.max(0, Math.round((t.grand_total_paise - (t.return_paise || 0)) / 100));

      let bill_itc = 0;
      if (has_gstin) {
        if (t.return_paise && t.return_paise > 0 && t.grand_total_paise > 0) {
          const returnRatio = t.return_paise / t.grand_total_paise;
          const returnTaxPaise = Math.round(t.tax_paise * returnRatio);
          bill_itc = Math.max(0, Math.round((t.tax_paise - returnTaxPaise) / 100));
        } else {
          bill_itc = bill_gst;
        }
      }

      const remainingPaise = Math.max(0, t.grand_total_paise - (t.return_paise || 0) - t.paid_paise);
      let payment_status: PaymentStatus = 'PENDING';
      if (remainingPaise === 0) payment_status = 'SETTLED';
      else if (t.due_date && new Date(t.due_date).getTime() < Date.now()) payment_status = 'OVERDUE';
      else if (t.paid_paise > 0 || (t.return_paise && t.return_paise > 0)) payment_status = 'PARTIAL';

      items.push({
        id: t.id,
        supplier_name: t.party_name,
        supplier_gstin: supplierGstin,
        has_gstin,
        invoice_number: t.invoice_number,
        bill_date: t.invoice_date,
        taxable_value,
        cgst,
        sgst,
        igst,
        total_gst: bill_gst,
        net_purchase_amount,
        returns,
        eligible_itc: bill_itc,
        payment_status
      });

      total_purchase_value += Math.round(t.grand_total_paise / 100);
      total_taxable_value += taxable_value;
      total_cgst += cgst;
      total_sgst += sgst;
      total_igst += igst;
      total_gst += bill_gst;
      total_returns += returns;
      eligible_itc += bill_itc;
    }

    items.sort((a, b) => b.bill_date.localeCompare(a.bill_date));

    return {
      items,
      totals: {
        total_purchase_value,
        total_taxable_value,
        total_cgst,
        total_sgst,
        total_igst,
        total_gst,
        total_returns,
        eligible_itc
      },
      period: { from: dateRange.from, to: dateRange.to, label: dateRange.label }
    };
  },

  getSalesLedger(shopId: string, options?: ReportFilterOptions): SalesLedgerReport {
    const txs = loadTransactions(shopId);
    const parties = loadParties(shopId);
    const dateRange = resolveReportDateRange(options);

    let salesTxs = txs.filter(t => t.type === 'SALE' && t.invoice_date >= dateRange.from && t.invoice_date <= dateRange.to);

    if (options?.partyId) {
      salesTxs = salesTxs.filter(t => t.party_id === options.partyId);
    }
    if (options?.partySearch && options.partySearch.trim()) {
      const q = options.partySearch.trim().toLowerCase();
      salesTxs = salesTxs.filter(t =>
        t.party_name.toLowerCase().includes(q) ||
        t.invoice_number.toLowerCase().includes(q)
      );
    }

    const items: SalesLedgerItem[] = [];
    let total_taxable_sales = 0;
    let total_cgst = 0;
    let total_sgst = 0;
    let total_igst = 0;
    let total_output_gst = 0;
    let total_sales_value = 0;
    let total_paid = 0;
    let total_outstanding_due = 0;
    let intra_state_sales = 0;
    let inter_state_sales = 0;

    for (const t of salesTxs) {
      const party = parties.find(p => p.id === t.party_id);
      const is_inter_state = Boolean(t.igst_paise > 0);
      const sales_type: 'INTRA_STATE' | 'INTER_STATE' = is_inter_state ? 'INTER_STATE' : 'INTRA_STATE';

      const taxable_value = Math.round(t.subtotal_paise / 100);
      const cgst = Math.round(t.cgst_paise / 100);
      const sgst = Math.round(t.sgst_paise / 100);
      const igst = Math.round(t.igst_paise / 100);
      const bill_gst = cgst + sgst + igst;
      const grand_total = Math.round(t.grand_total_paise / 100);
      const amount_paid = Math.round(t.paid_paise / 100);
      const remaining_due = Math.max(0, Math.round((t.grand_total_paise - (t.return_paise || 0) - t.paid_paise) / 100));

      let payment_status: PaymentStatus = 'PENDING';
      if (remaining_due === 0) payment_status = 'SETTLED';
      else if (t.due_date && new Date(t.due_date).getTime() < Date.now()) payment_status = 'OVERDUE';
      else if (t.paid_paise > 0 || (t.return_paise && t.return_paise > 0)) payment_status = 'PARTIAL';

      items.push({
        id: t.id,
        customer_name: t.party_name,
        customer_gstin: party?.gstin || null,
        invoice_number: t.invoice_number,
        bill_date: t.invoice_date,
        is_inter_state,
        sales_type,
        taxable_value,
        cgst,
        sgst,
        igst,
        total_gst: bill_gst,
        grand_total,
        amount_paid,
        remaining_due,
        payment_status
      });

      total_taxable_sales += taxable_value;
      total_cgst += cgst;
      total_sgst += sgst;
      total_igst += igst;
      total_output_gst += bill_gst;
      total_sales_value += grand_total;
      total_paid += amount_paid;
      total_outstanding_due += remaining_due;

      if (is_inter_state) {
        inter_state_sales += grand_total;
      } else {
        intra_state_sales += grand_total;
      }
    }

    items.sort((a, b) => b.bill_date.localeCompare(a.bill_date));

    return {
      items,
      totals: {
        total_taxable_sales,
        total_cgst,
        total_sgst,
        total_igst,
        total_output_gst,
        total_sales_value,
        total_paid,
        total_outstanding_due,
        intra_state_sales,
        inter_state_sales
      },
      period: { from: dateRange.from, to: dateRange.to, label: dateRange.label }
    };
  },

  getJobWorkLedger(shopId: string, options?: ReportFilterOptions): ArtisanJobWorkReport {
    const txs = loadTransactions(shopId);
    const dateRange = resolveReportDateRange(options);

    let jobTxs = txs.filter(t => t.type === 'JOB_WORK' && t.invoice_date >= dateRange.from && t.invoice_date <= dateRange.to);

    if (options?.partyId) {
      jobTxs = jobTxs.filter(t => t.party_id === options.partyId);
    }
    if (options?.partySearch && options.partySearch.trim()) {
      const q = options.partySearch.trim().toLowerCase();
      jobTxs = jobTxs.filter(t =>
        t.party_name.toLowerCase().includes(q) ||
        t.invoice_number.toLowerCase().includes(q)
      );
    }

    const items: ArtisanJobWorkItem[] = [];
    const artisanMap = new Map<string, ArtisanSummary>();
    let total_job_work_value = 0;
    let total_gst = 0;
    let total_payments = 0;
    let total_outstanding = 0;

    for (const t of jobTxs) {
      const job_work_amount = Math.round(t.subtotal_paise / 100);
      const gst = Math.round(t.tax_paise / 100);
      const total_amount = Math.round(t.grand_total_paise / 100);
      const amount_paid = Math.round(t.paid_paise / 100);
      const outstanding_amount = Math.max(0, Math.round((t.grand_total_paise - (t.return_paise || 0) - t.paid_paise) / 100));

      let payment_status: PaymentStatus = 'PENDING';
      if (outstanding_amount === 0) payment_status = 'SETTLED';
      else if (t.due_date && new Date(t.due_date).getTime() < Date.now()) payment_status = 'OVERDUE';
      else if (t.paid_paise > 0 || (t.return_paise && t.return_paise > 0)) payment_status = 'PARTIAL';

      const work_details = t.items?.[0]?.item_name || t.notes || 'Handloom Jacquard & Korvai Weaving';
      const quantity = t.items?.[0]?.quantity || 1;

      items.push({
        id: t.id,
        artisan_name: t.party_name,
        artisan_id: t.party_id,
        job_work_reference: t.invoice_number,
        transaction_date: t.invoice_date,
        work_details,
        quantity,
        job_work_amount,
        gst,
        total_amount,
        amount_paid,
        outstanding_amount,
        payment_status
      });

      total_job_work_value += total_amount;
      total_gst += gst;
      total_payments += amount_paid;
      total_outstanding += outstanding_amount;

      const existing = artisanMap.get(t.party_id) || {
        artisan_id: t.party_id,
        artisan_name: t.party_name,
        total_job_work_value: 0,
        total_gst: 0,
        total_payments: 0,
        outstanding_amount: 0,
        transaction_count: 0
      };
      existing.total_job_work_value += total_amount;
      existing.total_gst += gst;
      existing.total_payments += amount_paid;
      existing.outstanding_amount += outstanding_amount;
      existing.transaction_count += 1;
      artisanMap.set(t.party_id, existing);
    }

    items.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));

    return {
      items,
      artisan_summaries: Array.from(artisanMap.values()),
      totals: {
        total_job_work_value,
        total_gst,
        total_payments,
        total_outstanding
      },
      period: { from: dateRange.from, to: dateRange.to, label: dateRange.label }
    };
  },

  getGSTDashboard(shopId: string, options?: ReportFilterOptions): GSTDashboardData {
    const salesReport = this.getSalesLedger(shopId, options);
    const purchaseReport = this.getPurchaseLedger(shopId, options);

    const total_taxable_sales = salesReport.totals.total_taxable_sales;
    const output_gst = salesReport.totals.total_output_gst;
    const eligible_itc = purchaseReport.totals.eligible_itc;
    const net_gst_payable = Math.max(0, output_gst - eligible_itc);

    const tax_breakdown = {
      output_cgst: salesReport.totals.total_cgst,
      output_sgst: salesReport.totals.total_sgst,
      output_igst: salesReport.totals.total_igst,
      input_cgst: purchaseReport.totals.total_cgst,
      input_sgst: purchaseReport.totals.total_sgst,
      input_igst: purchaseReport.totals.total_igst
    };

    const monthsSet = new Set<string>();
    salesReport.items.forEach(it => {
      if (it.bill_date) monthsSet.add(it.bill_date.slice(0, 7));
    });
    purchaseReport.items.forEach(it => {
      if (it.bill_date) monthsSet.add(it.bill_date.slice(0, 7));
    });

    const sortedMonths = Array.from(monthsSet).sort();
    if (sortedMonths.length === 0) {
      const nowStr = new Date().toISOString().slice(0, 7);
      sortedMonths.push(nowStr);
    }

    const monthly_sales_vs_purchases = sortedMonths.map(m => {
      const s = salesReport.items.filter(it => it.bill_date.startsWith(m)).reduce((sum, it) => sum + it.grand_total, 0);
      const p = purchaseReport.items.filter(it => it.bill_date.startsWith(m)).reduce((sum, it) => sum + it.net_purchase_amount, 0);
      return { month: m, sales: s, purchases: p };
    });

    const monthly_output_gst_trend = sortedMonths.map(m => {
      const sItems = salesReport.items.filter(it => it.bill_date.startsWith(m));
      const cgst = sItems.reduce((sum, it) => sum + it.cgst, 0);
      const sgst = sItems.reduce((sum, it) => sum + it.sgst, 0);
      const igst = sItems.reduce((sum, it) => sum + it.igst, 0);
      return { month: m, output_gst: cgst + sgst + igst, cgst, sgst, igst };
    });

    const monthly_itc_trend = sortedMonths.map(m => {
      const itc = purchaseReport.items.filter(it => it.bill_date.startsWith(m)).reduce((sum, it) => sum + it.eligible_itc, 0);
      return { month: m, eligible_itc: itc };
    });

    const tax_component_comparison = [
      { component: 'CGST', output: tax_breakdown.output_cgst, input: tax_breakdown.input_cgst },
      { component: 'SGST', output: tax_breakdown.output_sgst, input: tax_breakdown.input_sgst },
      { component: 'IGST', output: tax_breakdown.output_igst, input: tax_breakdown.input_igst }
    ];

    const monthly_net_payable_trend = sortedMonths.map(m => {
      const outTax = salesReport.items.filter(it => it.bill_date.startsWith(m)).reduce((sum, it) => sum + it.total_gst, 0);
      const inItc = purchaseReport.items.filter(it => it.bill_date.startsWith(m)).reduce((sum, it) => sum + it.eligible_itc, 0);
      return { month: m, net_payable: Math.max(0, outTax - inItc) };
    });

    return {
      summary: {
        total_taxable_sales,
        output_gst,
        eligible_itc,
        net_gst_payable
      },
      tax_breakdown,
      charts: {
        monthly_sales_vs_purchases,
        monthly_output_gst_trend,
        monthly_itc_trend,
        tax_component_comparison,
        monthly_net_payable_trend
      },
      period: salesReport.period
    };
  },

  exportShopData(shopId: string, dataType: 'transactions' | 'parties' | 'reports'): { filename: string; contentType: string; data: string } {
    const now = new Date().toISOString().split('T')[0];

    if (dataType === 'transactions') {
      const txs = loadTransactions(shopId);
      const header = 'Invoice Number,Date,Party Name,Party Type,Type,Subtotal (INR),CGST (INR),SGST (INR),IGST (INR),Grand Total (INR),Paid (INR),Returns (INR),Pending (INR),Status\n';
      const rows = txs.map(t => {
        return [
          `"${t.invoice_number}"`,
          `"${t.invoice_date}"`,
          `"${t.party_name.replace(/"/g, '""')}"`,
          `"${t.party_type}"`,
          `"${t.type}"`,
          (t.subtotal_paise / 100).toFixed(2),
          (t.cgst_paise / 100).toFixed(2),
          (t.sgst_paise / 100).toFixed(2),
          (t.igst_paise / 100).toFixed(2),
          (t.grand_total_paise / 100).toFixed(2),
          (t.paid_paise / 100).toFixed(2),
          ((t.return_paise || 0) / 100).toFixed(2),
          (t.pending_paise / 100).toFixed(2),
          `"${t.status}"`
        ].join(',');
      }).join('\n');

      return {
        filename: `transactions_export_${shopId}_${now}.csv`,
        contentType: 'text/csv',
        data: header + rows
      };
    }

    if (dataType === 'parties') {
      const parties = loadParties(shopId);
      const header = 'Party Name,Type,Owner Name,Phone,Additional Phones,GSTIN,Address,State,PIN Code\n';
      const rows = parties.map(p => {
        return [
          `"${p.name.replace(/"/g, '""')}"`,
          `"${p.type}"`,
          `"${p.owner_name.replace(/"/g, '""')}"`,
          `"${p.phone}"`,
          `"${(p.additional_phones || []).join(';')}"`,
          `"${p.gstin || ''}"`,
          `"${p.address.replace(/"/g, '""')}"`,
          `"${p.state || ''}"`,
          `"${p.pin_code || ''}"`
        ].join(',');
      }).join('\n');

      return {
        filename: `parties_export_${shopId}_${now}.csv`,
        contentType: 'text/csv',
        data: header + rows
      };
    }

    const gstData = this.getGSTDashboard(shopId);
    const header = 'Metric,Value (INR)\n';
    const rows = [
      `Total Taxable Sales,${gstData.summary.total_taxable_sales}`,
      `Output GST,${gstData.summary.output_gst}`,
      `Eligible Input Tax Credit,${gstData.summary.eligible_itc}`,
      `Net GST Payable,${gstData.summary.net_gst_payable}`,
      `Output CGST,${gstData.tax_breakdown.output_cgst}`,
      `Output SGST,${gstData.tax_breakdown.output_sgst}`,
      `Output IGST,${gstData.tax_breakdown.output_igst}`,
      `Input CGST,${gstData.tax_breakdown.input_cgst}`,
      `Input SGST,${gstData.tax_breakdown.input_sgst}`,
      `Input IGST,${gstData.tax_breakdown.input_igst}`
    ].join('\n');

    return {
      filename: `gst_summary_report_${shopId}_${now}.csv`,
      contentType: 'text/csv',
      data: header + rows
    };
  }
};
