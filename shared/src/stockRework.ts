// Pure domain math for Stock & Production rework:
// - Finished stock status (OK / LOW / OUT / NEGATIVE) and void-safety check
// - Raw material non-clamped balance & weighted average rate
// - Weaver yarn reconciliation & wages due math
// - Polishing oldest-first payment allocation & polisher account balances

export type MovementRecordStatus = 'ACTIVE' | 'VOID';
export type FinishedStockStatus = 'OK' | 'LOW' | 'OUT' | 'NEGATIVE';

export function finishedStockStatus(balance: number, reorderLevel = 5): FinishedStockStatus {
  if (balance < 0) return 'NEGATIVE';
  if (balance === 0) return 'OUT';
  if (balance <= reorderLevel) return 'LOW';
  return 'OK';
}

export interface RunningStockEntry {
  id: string;
  date: string;
  qty: number; // signed
  status?: MovementRecordStatus;
}

/**
 * Checks whether voiding `targetId` would push any later chronological balance below zero.
 * Returns the first negative balance encountered (or null if safe).
 */
export function wouldVoidCauseNegative(
  entries: RunningStockEntry[],
  targetId: string
): { date: string; balanceAfter: number } | null {
  const active = entries
    .filter(e => (e.status ?? 'ACTIVE') === 'ACTIVE' && e.id !== targetId)
    .sort((a, b) => a.date.localeCompare(b.date));

  let running = 0;
  for (const e of active) {
    running += e.qty;
    if (running < 0) {
      return { date: e.date, balanceAfter: running };
    }
  }
  return null;
}

export interface RawMovementEntry {
  id: string;
  shop_id: string;
  material_id: string;
  date: string;
  kind: 'PURCHASE' | 'ISSUE_JOBWORK' | 'SOLD' | 'RETURN' | 'WASTAGE' | 'ADJUST';
  grams: number; // positive magnitude; sign determined by kind (or signed for ADJUST)
  rate_paise_per_kg: number;
  weaver_id?: string | null;
  status?: MovementRecordStatus;
}

export interface RawMaterialComputed {
  in_shop_grams: number;
  with_weavers_grams: number;
  purchased_grams: number;
  sold_grams: number;
  weighted_avg_rate_paise: number;
  stock_value_paise: number;
  status: 'OK' | 'LOW' | 'OUT' | 'NEGATIVE';
}

export function computeRawMaterialBalance(params: {
  shopId: string;
  materialId: string;
  movements: RawMovementEntry[];
  fallbackRatePaise?: number;
  reorderLevelGrams?: number;
}): RawMaterialComputed {
  const { shopId, materialId, movements, fallbackRatePaise = 0, reorderLevelGrams = 5000 } = params;
  let inShop = 0;
  let withWeavers = 0;
  let purchased = 0;
  let sold = 0;
  let purchaseValuePaise = 0;

  for (const m of movements) {
    if (m.shop_id !== shopId || m.material_id !== materialId) continue;
    if ((m.status ?? 'ACTIVE') !== 'ACTIVE') continue;

    switch (m.kind) {
      case 'PURCHASE':
        inShop += m.grams;
        purchased += m.grams;
        purchaseValuePaise += Math.round((m.grams * m.rate_paise_per_kg) / 1000);
        break;
      case 'ISSUE_JOBWORK':
        inShop -= m.grams;
        withWeavers += m.grams;
        break;
      case 'SOLD':
        inShop -= m.grams;
        sold += m.grams;
        break;
      case 'RETURN':
        inShop += m.grams;
        withWeavers -= m.grams;
        break;
      case 'WASTAGE':
        withWeavers -= m.grams;
        break;
      case 'ADJUST':
        inShop += m.grams;
        break;
    }
  }

  const weightedAvgRate =
    purchased > 0 ? Math.round((purchaseValuePaise * 1000) / purchased) : fallbackRatePaise;
  const stockValuePaise = Math.round((inShop * weightedAvgRate) / 1000);

  let status: RawMaterialComputed['status'] = 'OK';
  if (inShop < 0) status = 'NEGATIVE';
  else if (inShop === 0) status = 'OUT';
  else if (inShop <= reorderLevelGrams) status = 'LOW';

  return {
    in_shop_grams: inShop,
    with_weavers_grams: withWeavers,
    purchased_grams: purchased,
    sold_grams: sold,
    weighted_avg_rate_paise: weightedAvgRate,
    stock_value_paise: stockValuePaise,
    status
  };
}

export interface WeaverReconciliationInput {
  issuedGrams: number;
  sareesReceived: number;
  stdGramsPerSaree: number;
  leftoverReturnedGrams: number;
  allowedWastageGrams: number;
  actualWastageGrams?: number;
}

export function computeWeaverReconciliation(input: WeaverReconciliationInput) {
  const expectedUsedGrams = input.sareesReceived * input.stdGramsPerSaree;
  const pendingYarnGrams =
    input.issuedGrams - expectedUsedGrams - input.leftoverReturnedGrams - input.allowedWastageGrams;
  const actualWastage = input.actualWastageGrams ?? 0;
  const overWastageLimit = actualWastage > input.allowedWastageGrams || pendingYarnGrams > input.stdGramsPerSaree;

  return {
    expectedUsedGrams,
    pendingYarnGrams,
    overWastageLimit
  };
}

export function computeWeaverWagesDue(params: {
  earnedPaise: number;
  advancesPaise: number;
  paymentsPaise: number;
  yarnSoldPaise: number;
}): number {
  return params.earnedPaise - params.advancesPaise - params.paymentsPaise - params.yarnSoldPaise;
}

export interface PolishBatchForAlloc {
  id: string;
  shop_id: string;
  person_name: string;
  party_id?: string | null;
  sent_date: string;
  sarees_sent: number;
  sarees_received: number;
  unit_price_paise: number;
  status?: MovementRecordStatus;
}

export interface PolishPaymentForAlloc {
  id: string;
  shop_id: string;
  person_name: string;
  party_id?: string | null;
  date: string;
  amount_paise: number;
  status?: MovementRecordStatus;
}

export type PolishPayStatus = 'UNPAID' | 'PART' | 'PAID';

export interface AllocatedPolishEntry extends PolishBatchForAlloc {
  accrued_charge_paise: number;
  provisional_charge_paise: number;
  paid_paise: number;
  balance_paise: number;
  payment_status: PolishPayStatus;
}

export interface PolisherAccountSummary {
  person_key: string;
  person_name: string;
  party_id?: string | null;
  entries_count: number;
  sarees_sent: number;
  sarees_received: number;
  pending_sarees: number;
  total_charges_paise: number;
  provisional_paise: number;
  total_paid_paise: number;
  balance_payable_paise: number;
}

export function allocatePolishPayments(params: {
  shopId: string;
  batches: PolishBatchForAlloc[];
  payments: PolishPaymentForAlloc[];
}): { entries: AllocatedPolishEntry[]; accounts: PolisherAccountSummary[] } {
  const { shopId, batches, payments } = params;
  const activeBatches = batches
    .filter(b => b.shop_id === shopId && (b.status ?? 'ACTIVE') === 'ACTIVE')
    .sort((a, b) => a.sent_date.localeCompare(b.sent_date));
  const activePayments = payments.filter(p => p.shop_id === shopId && (p.status ?? 'ACTIVE') === 'ACTIVE');

  const keyOf = (partyId?: string | null, name?: string) => partyId || (name ?? '').trim().toLowerCase();

  const paidPoolByPerson = new Map<string, number>();
  for (const p of activePayments) {
    const k = keyOf(p.party_id, p.person_name);
    paidPoolByPerson.set(k, (paidPoolByPerson.get(k) ?? 0) + p.amount_paise);
  }

  const remainingPool = new Map(paidPoolByPerson);
  const accMap = new Map<string, PolisherAccountSummary>();
  const entries: AllocatedPolishEntry[] = [];

  for (const b of activeBatches) {
    const k = keyOf(b.party_id, b.person_name);
    const accrued = b.sarees_received * b.unit_price_paise;
    const provisional = Math.max(0, b.sarees_sent - b.sarees_received) * b.unit_price_paise;
    const pool = remainingPool.get(k) ?? 0;
    const applied = Math.min(accrued, pool);
    remainingPool.set(k, pool - applied);
    const bal = accrued - applied;
    const payment_status: PolishPayStatus =
      accrued === 0 ? 'UNPAID' : bal <= 0 ? 'PAID' : applied > 0 ? 'PART' : 'UNPAID';

    entries.push({
      ...b,
      accrued_charge_paise: accrued,
      provisional_charge_paise: provisional,
      paid_paise: applied,
      balance_paise: bal,
      payment_status
    });

    const acct = accMap.get(k) ?? {
      person_key: k,
      person_name: b.person_name,
      party_id: b.party_id ?? null,
      entries_count: 0,
      sarees_sent: 0,
      sarees_received: 0,
      pending_sarees: 0,
      total_charges_paise: 0,
      provisional_paise: 0,
      total_paid_paise: paidPoolByPerson.get(k) ?? 0,
      balance_payable_paise: 0
    };
    acct.entries_count += 1;
    acct.sarees_sent += b.sarees_sent;
    acct.sarees_received += b.sarees_received;
    acct.pending_sarees += Math.max(0, b.sarees_sent - b.sarees_received);
    acct.total_charges_paise += accrued;
    acct.provisional_paise += provisional;
    acct.balance_payable_paise = acct.total_charges_paise - acct.total_paid_paise;
    accMap.set(k, acct);
  }

  // Also include persons who only have advance payments and no batches yet
  for (const p of activePayments) {
    const k = keyOf(p.party_id, p.person_name);
    if (!accMap.has(k)) {
      const paid = paidPoolByPerson.get(k) ?? 0;
      accMap.set(k, {
        person_key: k,
        person_name: p.person_name,
        party_id: p.party_id ?? null,
        entries_count: 0,
        sarees_sent: 0,
        sarees_received: 0,
        pending_sarees: 0,
        total_charges_paise: 0,
        provisional_paise: 0,
        total_paid_paise: paid,
        balance_payable_paise: -paid
      });
    }
  }

  return {
    entries: entries.sort((a, b) => b.sent_date.localeCompare(a.sent_date)),
    accounts: [...accMap.values()].sort((a, b) => b.balance_payable_paise - a.balance_payable_paise)
  };
}
