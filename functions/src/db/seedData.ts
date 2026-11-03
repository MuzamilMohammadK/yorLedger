import { Transaction, Party, TransactionItem, DashboardSummary, DashboardCharts, DateRangeOption } from '@yorbalance/shared';
import { v4 as uuidv4 } from 'uuid';

export function createSeedParties(shopId: string): Party[] {
  return [
    {
      id: `party-cust-1-${shopId}`,
      shop_id: shopId,
      name: 'Meenakshi Bridal Sarees',
      type: 'CUSTOMER',
      owner_name: 'Meenakshi Sundaram',
      gstin: '36AAACM8401P1Z3',
      phone: '9849011223',
      alt_phone: '9849011224',
      address: 'Shop 12, Sultan Bazaar, Koti, Hyderabad, Telangana',
      state_code: '36',
      created_at: new Date(Date.now() - 90 * 86400000).toISOString()
    },
    {
      id: `party-cust-2-${shopId}`,
      shop_id: shopId,
      name: 'Ananya Silks & Textiles',
      type: 'CUSTOMER',
      owner_name: 'Ananya Hegde',
      gstin: '29AAAAA0000A1Z5',
      phone: '9880123456',
      address: 'Commercial Street, Bangalore, Karnataka',
      state_code: '29',
      created_at: new Date(Date.now() - 75 * 86400000).toISOString()
    },
    {
      id: `party-cust-3-${shopId}`,
      shop_id: shopId,
      name: 'Kala Mandir Silk Emporium',
      type: 'CUSTOMER',
      owner_name: 'S. Rajagopalan',
      gstin: '33AAACK4019Q1ZP',
      phone: '9444055667',
      address: 'T. Nagar, Chennai, Tamil Nadu',
      state_code: '33',
      created_at: new Date(Date.now() - 60 * 86400000).toISOString()
    },
    {
      id: `party-cust-4-${shopId}`,
      shop_id: shopId,
      name: 'Vardhman Wedding Collection',
      type: 'CUSTOMER',
      owner_name: 'Virendra Shah',
      gstin: '27AAACV9012R1ZN',
      phone: '9820011223',
      address: 'Dadar Market, Mumbai, Maharashtra',
      state_code: '27',
      created_at: new Date(Date.now() - 50 * 86400000).toISOString()
    },
    {
      id: `party-supp-1-${shopId}`,
      shop_id: shopId,
      name: 'Sri Murugan Raw Silk Filature',
      type: 'SUPPLIER',
      owner_name: 'K. Murugan',
      gstin: '29AAACM1234P1Z2',
      phone: '9448099881',
      address: 'Silk Cocoon Market Road, Ramanagara, Karnataka',
      state_code: '29',
      created_at: new Date(Date.now() - 100 * 86400000).toISOString()
    },
    {
      id: `party-supp-2-${shopId}`,
      shop_id: shopId,
      name: 'Surat Pure Zari Mills Pvt Ltd',
      type: 'SUPPLIER',
      owner_name: 'Girish Patel',
      gstin: '24AAACS5678Q1Z1',
      phone: '9825044332',
      address: 'Ring Road Textile Market, Surat, Gujarat',
      state_code: '24',
      created_at: new Date(Date.now() - 80 * 86400000).toISOString()
    },
    {
      id: `party-art-1-${shopId}`,
      shop_id: shopId,
      name: 'Shankar Handloom & Weaving Works',
      type: 'ARTISAN',
      owner_name: 'Shankarappa',
      phone: '9440188776',
      address: 'Weavers Colony, Dharmavaram, Andhra Pradesh',
      state_code: '37',
      created_at: new Date(Date.now() - 70 * 86400000).toISOString()
    },
    {
      id: `party-art-2-${shopId}`,
      shop_id: shopId,
      name: 'Narayana Silk Craft Works',
      type: 'ARTISAN',
      owner_name: 'Narayana Swamy',
      phone: '9848033221',
      address: 'Pochampally Weaving Park, Telangana',
      state_code: '36',
      created_at: new Date(Date.now() - 40 * 86400000).toISOString()
    }
  ];
}

export function createSeedTransactions(shopId: string, parties: Party[]): Transaction[] {
  const cust1 = parties.find(p => p.name.includes('Meenakshi')) || parties[0];
  const cust2 = parties.find(p => p.name.includes('Ananya')) || parties[1];
  const cust3 = parties.find(p => p.name.includes('Kala Mandir')) || parties[2];
  const cust4 = parties.find(p => p.name.includes('Vardhman')) || parties[3];
  const supp1 = parties.find(p => p.type === 'SUPPLIER') || parties[4];
  const supp2 = parties.find(p => p.name.includes('Surat')) || parties[5];
  const art1 = parties.find(p => p.type === 'ARTISAN') || parties[6];
  const art2 = parties.find(p => p.name.includes('Narayana')) || parties[7];

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const getDate = (daysAgo: number): string => {
    const d = new Date(now.getTime() - daysAgo * 86400000);
    return d.toISOString().split('T')[0];
  };

  return [
    // Today/Recent Sale 1
    {
      id: `tx-sale-1-${shopId}`,
      shop_id: shopId,
      party_id: cust1.id,
      party_name: cust1.name,
      party_type: 'CUSTOMER',
      type: 'SALE',
      invoice_number: 'INV-2026-001',
      invoice_date: getDate(1),
      subtotal_paise: 18000000, // ₹1,80,000
      tax_paise: 900000,        // ₹9,000 (5%)
      cgst_paise: 450000,
      sgst_paise: 450000,
      igst_paise: 0,
      grand_total_paise: 18900000, // ₹1,89,000
      paid_paise: 18900000,
      pending_paise: 0,
      status: 'SETTLED',
      items: [
        { id: uuidv4(), transaction_id: `tx-sale-1-${shopId}`, item_name: 'Pure Kanchipuram Bridal Silk Saree', quantity: 10, rate_paise: 1200000, gst_rate_bp: 500, amount_paise: 12000000 },
        { id: uuidv4(), transaction_id: `tx-sale-1-${shopId}`, item_name: 'Dharmavaram Traditional Pattu Saree', quantity: 6, rate_paise: 1000000, gst_rate_bp: 500, amount_paise: 6000000 }
      ],
      created_at: new Date(now.getTime() - 1 * 86400000).toISOString()
    },
    // Sale 2 - Pending
    {
      id: `tx-sale-2-${shopId}`,
      shop_id: shopId,
      party_id: cust2.id,
      party_name: cust2.name,
      party_type: 'CUSTOMER',
      type: 'SALE',
      invoice_number: 'INV-2026-002',
      invoice_date: getDate(3),
      subtotal_paise: 9500000, // ₹95,000
      tax_paise: 475000,       // ₹4,750
      cgst_paise: 0,
      sgst_paise: 0,
      igst_paise: 475000,
      grand_total_paise: 9975000, // ₹99,750
      paid_paise: 0,
      pending_paise: 9975000,
      status: 'PENDING',
      items: [
        { id: uuidv4(), transaction_id: `tx-sale-2-${shopId}`, item_name: 'Banarasi Meenakari Silk Saree', quantity: 5, rate_paise: 1900000, gst_rate_bp: 500, amount_paise: 9500000 }
      ],
      created_at: new Date(now.getTime() - 3 * 86400000).toISOString()
    },
    // Purchase 1 - Raw Silk
    {
      id: `tx-pur-1-${shopId}`,
      shop_id: shopId,
      party_id: supp1.id,
      party_name: supp1.name,
      party_type: 'SUPPLIER',
      type: 'PURCHASE',
      invoice_number: 'PUR-2026-101',
      invoice_date: getDate(4),
      subtotal_paise: 12000000, // ₹1,20,000
      tax_paise: 600000,        // ₹6,000
      cgst_paise: 0,
      sgst_paise: 0,
      igst_paise: 600000,
      grand_total_paise: 12600000, // ₹1,26,000
      paid_paise: 12600000,
      pending_paise: 0,
      status: 'SETTLED',
      items: [
        { id: uuidv4(), transaction_id: `tx-pur-1-${shopId}`, item_name: 'Mulberry Raw Silk Yarn (40 kg)', quantity: 40, rate_paise: 300000, gst_rate_bp: 500, amount_paise: 12000000 }
      ],
      created_at: new Date(now.getTime() - 4 * 86400000).toISOString()
    },
    // Job Work 1 - Artisan Finishing
    {
      id: `tx-job-1-${shopId}`,
      shop_id: shopId,
      party_id: art1.id,
      party_name: art1.name,
      party_type: 'ARTISAN',
      type: 'JOB_WORK',
      invoice_number: 'JOB-2026-201',
      invoice_date: getDate(6),
      subtotal_paise: 4500000, // ₹45,000
      tax_paise: 225000,
      cgst_paise: 112500,
      sgst_paise: 112500,
      igst_paise: 0,
      grand_total_paise: 4725000, // ₹47,250
      paid_paise: 2500000,
      pending_paise: 2225000, // ₹22,250 pending
      status: 'PARTIAL',
      items: [
        { id: uuidv4(), transaction_id: `tx-job-1-${shopId}`, item_name: 'Handloom Jacquard Border & Zari Korvai Weaving (15 Sarees)', quantity: 15, rate_paise: 300000, gst_rate_bp: 500, amount_paise: 4500000 }
      ],
      created_at: new Date(now.getTime() - 6 * 86400000).toISOString()
    },
    // Sale 3 - Partial
    {
      id: `tx-sale-3-${shopId}`,
      shop_id: shopId,
      party_id: cust3.id,
      party_name: cust3.name,
      party_type: 'CUSTOMER',
      type: 'SALE',
      invoice_number: 'INV-2026-003',
      invoice_date: getDate(10),
      subtotal_paise: 25000000, // ₹2,50,000
      tax_paise: 1250000,
      cgst_paise: 0,
      sgst_paise: 0,
      igst_paise: 1250000,
      grand_total_paise: 26250000, // ₹2,62,500
      paid_paise: 15000000,
      pending_paise: 11250000, // ₹1,12,500 pending
      status: 'PARTIAL',
      items: [
        { id: uuidv4(), transaction_id: `tx-sale-3-${shopId}`, item_name: 'Soft Silk Festive Sarees', quantity: 20, rate_paise: 1250000, gst_rate_bp: 500, amount_paise: 25000000 }
      ],
      created_at: new Date(now.getTime() - 10 * 86400000).toISOString()
    },
    // Purchase 2 - Zari
    {
      id: `tx-pur-2-${shopId}`,
      shop_id: shopId,
      party_id: supp2.id,
      party_name: supp2.name,
      party_type: 'SUPPLIER',
      type: 'PURCHASE',
      invoice_number: 'PUR-2026-102',
      invoice_date: getDate(15),
      subtotal_paise: 8000000, // ₹80,000
      tax_paise: 400000,
      cgst_paise: 0,
      sgst_paise: 0,
      igst_paise: 400000,
      grand_total_paise: 8400000, // ₹84,000
      paid_paise: 4000000,
      pending_paise: 4400000, // ₹44,000 pending
      status: 'PARTIAL',
      items: [
        { id: uuidv4(), transaction_id: `tx-pur-2-${shopId}`, item_name: 'Tested Golden Zari Bobbins & Spools', quantity: 10, rate_paise: 800000, gst_rate_bp: 500, amount_paise: 8000000 }
      ],
      created_at: new Date(now.getTime() - 15 * 86400000).toISOString()
    },
    // Sale 4 - Last Month (October)
    {
      id: `tx-sale-4-${shopId}`,
      shop_id: shopId,
      party_id: cust4.id,
      party_name: cust4.name,
      party_type: 'CUSTOMER',
      type: 'SALE',
      invoice_number: 'INV-2026-004',
      invoice_date: getDate(25),
      subtotal_paise: 32000000, // ₹3,20,000
      tax_paise: 1600000,
      cgst_paise: 0,
      sgst_paise: 0,
      igst_paise: 1600000,
      grand_total_paise: 33600000, // ₹3,36,000
      paid_paise: 33600000,
      pending_paise: 0,
      status: 'SETTLED',
      items: [
        { id: uuidv4(), transaction_id: `tx-sale-4-${shopId}`, item_name: 'Organza Silk Handloom Saree Collection', quantity: 16, rate_paise: 2000000, gst_rate_bp: 500, amount_paise: 32000000 }
      ],
      created_at: new Date(now.getTime() - 25 * 86400000).toISOString()
    },
    // Sale 5 - Settled
    {
      id: `tx-sale-5-${shopId}`,
      shop_id: shopId,
      party_id: cust1.id,
      party_name: cust1.name,
      party_type: 'CUSTOMER',
      type: 'SALE',
      invoice_number: 'INV-2026-005',
      invoice_date: getDate(35),
      subtotal_paise: 15000000,
      tax_paise: 750000,
      cgst_paise: 375000,
      sgst_paise: 375000,
      igst_paise: 0,
      grand_total_paise: 15750000, // ₹1,57,500
      paid_paise: 15750000,
      pending_paise: 0,
      status: 'SETTLED',
      items: [
        { id: uuidv4(), transaction_id: `tx-sale-5-${shopId}`, item_name: 'Tussar Silk Printed Sarees', quantity: 15, rate_paise: 1000000, gst_rate_bp: 500, amount_paise: 15000000 }
      ],
      created_at: new Date(now.getTime() - 35 * 86400000).toISOString()
    },
    // Purchase 3 - Last Month
    {
      id: `tx-pur-3-${shopId}`,
      shop_id: shopId,
      party_id: supp1.id,
      party_name: supp1.name,
      party_type: 'SUPPLIER',
      type: 'PURCHASE',
      invoice_number: 'PUR-2026-103',
      invoice_date: getDate(40),
      subtotal_paise: 14000000,
      tax_paise: 700000,
      cgst_paise: 0,
      sgst_paise: 0,
      igst_paise: 700000,
      grand_total_paise: 14700000, // ₹1,47,000
      paid_paise: 14700000,
      pending_paise: 0,
      status: 'SETTLED',
      items: [
        { id: uuidv4(), transaction_id: `tx-pur-3-${shopId}`, item_name: 'High Twist Silk Warp Cones', quantity: 35, rate_paise: 400000, gst_rate_bp: 500, amount_paise: 14000000 }
      ],
      created_at: new Date(now.getTime() - 40 * 86400000).toISOString()
    },
    // Job Work 2 - Last Month
    {
      id: `tx-job-2-${shopId}`,
      shop_id: shopId,
      party_id: art2.id,
      party_name: art2.name,
      party_type: 'ARTISAN',
      type: 'JOB_WORK',
      invoice_number: 'JOB-2026-202',
      invoice_date: getDate(45),
      subtotal_paise: 5000000,
      tax_paise: 250000,
      cgst_paise: 125000,
      sgst_paise: 125000,
      igst_paise: 0,
      grand_total_paise: 5250000, // ₹52,500
      paid_paise: 5250000,
      pending_paise: 0,
      status: 'SETTLED',
      items: [
        { id: uuidv4(), transaction_id: `tx-job-2-${shopId}`, item_name: 'Pochampally Ikat Dyeing and Weft Designing', quantity: 20, rate_paise: 250000, gst_rate_bp: 500, amount_paise: 5000000 }
      ],
      created_at: new Date(now.getTime() - 45 * 86400000).toISOString()
    },
    // Historical Sale (August/September)
    {
      id: `tx-sale-6-${shopId}`,
      shop_id: shopId,
      party_id: cust2.id,
      party_name: cust2.name,
      party_type: 'CUSTOMER',
      type: 'SALE',
      invoice_number: 'INV-2026-006',
      invoice_date: getDate(65),
      subtotal_paise: 40000000,
      tax_paise: 2000000,
      cgst_paise: 0,
      sgst_paise: 0,
      igst_paise: 2000000,
      grand_total_paise: 42000000, // ₹4,20,000
      paid_paise: 42000000,
      pending_paise: 0,
      status: 'SETTLED',
      items: [
        { id: uuidv4(), transaction_id: `tx-sale-6-${shopId}`, item_name: 'Festival Special Silk Assortment', quantity: 25, rate_paise: 1600000, gst_rate_bp: 500, amount_paise: 40000000 }
      ],
      created_at: new Date(now.getTime() - 65 * 86400000).toISOString()
    },
    // Historical Purchase
    {
      id: `tx-pur-4-${shopId}`,
      shop_id: shopId,
      party_id: supp1.id,
      party_name: supp1.name,
      party_type: 'SUPPLIER',
      type: 'PURCHASE',
      invoice_number: 'PUR-2026-104',
      invoice_date: getDate(75),
      subtotal_paise: 22000000,
      tax_paise: 1100000,
      cgst_paise: 0,
      sgst_paise: 0,
      igst_paise: 1100000,
      grand_total_paise: 23100000, // ₹2,31,000
      paid_paise: 23100000,
      pending_paise: 0,
      status: 'SETTLED',
      items: [
        { id: uuidv4(), transaction_id: `tx-pur-4-${shopId}`, item_name: 'Karnataka Charkha Raw Silk Bulk Lot', quantity: 50, rate_paise: 440000, gst_rate_bp: 500, amount_paise: 22000000 }
      ],
      created_at: new Date(now.getTime() - 75 * 86400000).toISOString()
    }
  ];
}

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
        // Indian Financial Year: April 1 to March 31
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
      // Return reduces sales
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

  // 1. Monthly Comparison (Bar Chart)
  // Group all transactions by month
  const monthMap = new Map<string, { sales: number; purchases: number }>();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Initialize last 6 months
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

  // 2. Sales Trend (Line Chart) for current filtered transactions
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

  // 3. Pending vs Settled (Pie Chart)
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
