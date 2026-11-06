import { Transaction, Party, TransactionItem, DashboardSummary, DashboardCharts, DateRangeOption } from '@yorbalance/shared';


// Pure dashboard calculations over real bills (no sample data).
export function filterTransactionsByPeriod(transactions: Transaction[], period: DateRangeOption = 'this_month'): Transaction[] {
  const now = new Date();

  return transactions.filter(tx => {
    const txDate = new Date(tx.invoice_date);

    switch (period) {
      case 'this_month': {
        return txDate.getFullYear() === now.getFullYear() && txDate.getMonth() === now.getMonth();
      }
      case 'last_30_days': {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
        return txDate >= thirtyDaysAgo && txDate <= now;
      }
      case 'this_quarter': {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        const quarterStart = new Date(now.getFullYear(), currentQuarter * 3, 1);
        return txDate >= quarterStart && txDate <= now;
      }
      case 'this_fy': {
        const currentYear = now.getFullYear();
        const fyStartYear = now.getMonth() >= 3 ? currentYear : currentYear - 1;
        const fyStart = new Date(fyStartYear, 3, 1);
        const fyEnd = new Date(fyStartYear + 1, 2, 31, 23, 59, 59);
        return txDate >= fyStart && txDate <= fyEnd;
      }
      case 'all_time':
      default:
        return true;
    }
  });
}

export function calculateSummary(transactions: Transaction[], period: DateRangeOption = 'this_month'): DashboardSummary {
  const filtered = filterTransactionsByPeriod(transactions, period);

  let totalSalesPaise = 0;
  let totalPurchasesPaise = 0;
  let pendingPaise = 0;
  let settledPaise = 0;
  let totalValuePaise = 0;

  for (const tx of filtered) {
    totalValuePaise += tx.grand_total_paise;
    pendingPaise += tx.pending_paise;

    if (tx.status === 'SETTLED') {
      settledPaise += tx.grand_total_paise;
    } else {
      settledPaise += tx.paid_paise;
    }

    if (tx.type === 'SALE') {
      totalSalesPaise += tx.grand_total_paise;
    } else if (tx.type === 'PURCHASE' || tx.type === 'JOB_WORK') {
      totalPurchasesPaise += tx.grand_total_paise;
    } else if (tx.type === 'RETURN') {
      totalSalesPaise -= tx.grand_total_paise;
    }
  }

  const periodLabels: Record<DateRangeOption, string> = {
    this_month: 'This Month',
    last_30_days: 'Last 30 Days',
    this_quarter: 'This Quarter',
    this_fy: 'Financial Year 2026-27',
    all_time: 'All Time'
  };

  return {
    total_transactions: filtered.length,
    pending_amount: Math.round(pendingPaise / 100),
    settled_amount: Math.round(settledPaise / 100),
    total_value: Math.round(totalValuePaise / 100),
    net_balance: Math.round((totalSalesPaise - totalPurchasesPaise) / 100),
    total_sales: Math.round(totalSalesPaise / 100),
    total_purchases: Math.round(totalPurchasesPaise / 100),
    period,
    period_label: periodLabels[period] || 'Selected Period'
  };
}

export function calculateCharts(transactions: Transaction[], period: DateRangeOption = 'this_month'): DashboardCharts {
  const filtered = filterTransactionsByPeriod(transactions, period);
  const summary = calculateSummary(transactions, period);

  const monthMap = new Map<string, { sales: number; purchases: number }>();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
    monthMap.set(key, { sales: 0, purchases: 0 });
  }

  for (const tx of transactions) {
    const d = new Date(tx.invoice_date);
    const key = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
    if (monthMap.has(key)) {
      const entry = monthMap.get(key)!;
      if (tx.type === 'SALE') {
        entry.sales += Math.round(tx.grand_total_paise / 100);
      } else if (tx.type === 'PURCHASE' || tx.type === 'JOB_WORK') {
        entry.purchases += Math.round(tx.grand_total_paise / 100);
      }
    }
  }

  const sales_vs_purchases = Array.from(monthMap.entries()).map(([month, data]) => ({
    month,
    sales: data.sales,
    purchases: data.purchases
  }));

  const dateMap = new Map<string, { sales: number; invoices: number }>();
  const salesTx = filtered.filter(tx => tx.type === 'SALE').sort((a, b) => a.invoice_date.localeCompare(b.invoice_date));

  for (const tx of salesTx) {
    const d = tx.invoice_date;
    const entry = dateMap.get(d) || { sales: 0, invoices: 0 };
    entry.sales += Math.round(tx.grand_total_paise / 100);
    entry.invoices += 1;
    dateMap.set(d, entry);
  }

  const sales_trend = Array.from(dateMap.entries()).map(([date, data]) => ({
    date: new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    sales: data.sales,
    invoices: data.invoices
  }));

  let pendingTotal = 0;
  let settledTotal = 0;
  let pendingCount = 0;
  let settledCount = 0;

  for (const tx of filtered) {
    if (tx.pending_paise > 0) {
      pendingTotal += tx.pending_paise;
      pendingCount += 1;
    }
    if (tx.paid_paise > 0) {
      settledTotal += tx.paid_paise;
      settledCount += 1;
    }
  }

  const pending_vs_settled = [
    { name: 'Settled', value: Math.round(settledTotal / 100), count: settledCount },
    { name: 'Pending Dues', value: Math.round(pendingTotal / 100), count: pendingCount }
  ];

  return {
    sales_vs_purchases,
    sales_trend,
    pending_vs_settled,
    summary: {
      total_sales: summary.total_sales,
      total_purchases: summary.total_purchases,
      net_balance: summary.net_balance
    }
  };
}

