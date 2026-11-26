// Live, offline-capable view of one shop's ledger data.
//
// One listener per collection for the whole session: the first load costs one
// read per document, later changes cost one read per changed document, and the
// persistent cache serves restarts. That keeps a small shop well inside the
// Spark free tier (50k reads/day) while every screen reads from memory.
import { collection, onSnapshot, Unsubscribe } from 'firebase/firestore';
import {
  Party, PaymentRecord, ReturnRecord, Transaction, TransactionItem, PaymentStatus,
  StockMovement, RawMaterial, RawMaterialTx, Weaver, OwnLoomRegister, LoomType,
  WeaverTransaction, Staff, StaffRecord, PolishingBatch
} from '@yorbalance/shared';
import { db } from '../firebase';
import { toIso, todayIST } from './util';

export interface BillItemDoc { name: string; qty: number; rate: number; line_total: number; hsn_code?: string | null }

type Raw = Record<string, any> & { id: string };

const COLLECTIONS = [
  'parties', 'bills', 'payments', 'returns',
  'stockMovements', 'polishing'
] as const;
type Col = typeof COLLECTIONS[number];

class ShopCache {
  private shopId: string | null = null;
  private raw: Record<Col, Map<string, Raw>> = {
    parties: new Map(), bills: new Map(), payments: new Map(), returns: new Map(),
    stockMovements: new Map(), polishing: new Map()
  };
  private loaded = new Set<Col>();
  private unsubs: Unsubscribe[] = [];
  private readyResolvers: Array<() => void> = [];
  private readyRejecters: Array<(e: unknown) => void> = [];
  private listeners = new Set<() => void>();
  private memo: {
    tx?: Transaction[];
    parties?: Party[];
    payments?: PaymentRecord[];
    returns?: ReturnRecord[];
    stockMovements?: StockMovement[];
    rawMaterials?: RawMaterial[];
    rawMaterialTx?: RawMaterialTx[];
    weavers?: Weaver[];
    ownLooms?: OwnLoomRegister | null;
    weaverTx?: WeaverTransaction[];
    staff?: Staff[];
    staffRecords?: StaffRecord[];
    polishing?: PolishingBatch[];
  } = {};

  get currentShopId() { return this.shopId; }

  /** Start (or switch) the live subscription for a shop. Idempotent. */
  start(shopId: string) {
    if (this.shopId === shopId) return;
    this.stop();
    this.shopId = shopId;
    for (const col of COLLECTIONS) {
      const unsub = onSnapshot(
        collection(db, 'shops', shopId, col),
        snap => {
          const m = this.raw[col];
          snap.docChanges().forEach(ch => {
            if (ch.type === 'removed') m.delete(ch.doc.id);
            else m.set(ch.doc.id, { id: ch.doc.id, ...ch.doc.data({ serverTimestamps: 'estimate' }) });
          });
          this.memo = {};
          this.loaded.add(col);
          if (this.loaded.size === COLLECTIONS.length) {
            this.readyResolvers.splice(0).forEach(r => r());
            this.readyRejecters = [];
          }
          this.listeners.forEach(l => l());
        },
        err => {
          console.error(`Live sync failed for ${col}:`, err);
          this.readyRejecters.splice(0).forEach(r => r(err));
          this.readyResolvers = [];
        }
      );
      this.unsubs.push(unsub);
    }
  }

  stop() {
    this.unsubs.splice(0).forEach(u => u());
    this.shopId = null;
    this.loaded.clear();
    for (const col of COLLECTIONS) this.raw[col].clear();
    this.memo = {};
  }

  ready(shopId: string): Promise<void> {
    this.start(shopId);
    if (this.loaded.size === COLLECTIONS.length) return Promise.resolve();
    return new Promise((res, rej) => {
      this.readyResolvers.push(res);
      this.readyRejecters.push(rej);
    });
  }

  /** Subscribe to any data change (used by screens to refresh live). */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  rawBill(id: string) { return this.raw.bills.get(id); }

  /**
   * Firestore transactions are not applied to the local cache until the server confirms
   * and the listener delivers them. Wait until `ready(bill)` is true (default: bill exists).
   */
  waitForBill(id: string, ready: (b: Record<string, any>) => boolean = () => true, timeoutMs = 15000): Promise<void> {
    const ok = () => { const b = this.raw.bills.get(id); return !!b && ready(b); };
    if (ok()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => { unsub(); reject(new Error('Saved, but the screen did not refresh. Please reopen this page.')); }, timeoutMs);
      const unsub = this.subscribe(() => { if (ok()) { window.clearTimeout(timer); unsub(); resolve(); } });
    });
  }
  rawParty(id: string) {
    return this.raw.parties.get(id);
  }
  rawBills() { return [...this.raw.bills.values()].filter(b => !b.deleted_at); }
  rawReturns() { return [...this.raw.returns.values()]; }
  rawStockMovements() { return [...this.raw.stockMovements.values()]; }
  rawPolishing() { return [...this.raw.polishing.values()]; }
  rawRawMaterialTx(): Raw[] { return []; }
  rawWeaverTx(): Raw[] { return []; }
  rawOwnLoomsDoc(): Raw | null { return null; }

  mapRawBill(b: Raw): Transaction {
    return this.toTransaction(b, this.payments(), this.returns());
  }

  parties(): Party[] {
    if (this.memo.parties) return this.memo.parties;
    // Exclude ARTISAN / weaver parties so weavers live ONLY in Stock & Production
    const out = [...this.raw.parties.values()]
      .filter(p => !p.deleted_at && p.type !== 'ARTISAN')
      .map(p => this.toParty(p));
    return (this.memo.parties = out);
  }

  payments(): PaymentRecord[] {
    if (this.memo.payments) return this.memo.payments;
    const out = [...this.raw.payments.values()].map(p => this.toPayment(p));
    return (this.memo.payments = out);
  }

  returns(): ReturnRecord[] {
    if (this.memo.returns) return this.memo.returns;
    const out = [...this.raw.returns.values()].map(r => {
      const bill = this.raw.bills.get(r.bill_id);
      const total = Number(r.total_reduction ?? 0);
      let taxable = r.taxable_reduction !== undefined ? Number(r.taxable_reduction) : undefined;
      let cgst = r.cgst !== undefined ? Number(r.cgst) : undefined;
      let sgst = r.sgst !== undefined ? Number(r.sgst) : undefined;
      let igst = r.igst !== undefined ? Number(r.igst) : undefined;

      if (taxable === undefined && bill && bill.grand_total > 0) {
        taxable = Math.round((total * (bill.subtotal || 0)) / bill.grand_total);
        const tax = Math.max(0, total - taxable);
        if (bill.tax_mode === 'INTER' || (bill.igst ?? 0) > 0) {
          cgst = 0; sgst = 0; igst = tax;
        } else {
          sgst = Math.floor(tax / 2);
          cgst = tax - sgst;
          igst = 0;
        }
      }
      const c = cgst ?? 0;
      const s = sgst ?? 0;
      const ig = igst ?? 0;
      const items = Array.isArray(r.items)
        ? r.items.map((it: any) => ({
            index: Number(it.index),
            name: String(it.name ?? bill?.items?.[it.index]?.name ?? ''),
            qty: Number(it.qty ?? 0),
            rate_paise: bill?.items?.[it.index]?.rate !== undefined ? Number(bill.items[it.index].rate) : undefined
          }))
        : undefined;

      return {
        id: r.id,
        shop_id: this.shopId!,
        transaction_id: r.bill_id,
        party_id: r.party_id,
        amount_paise: total,
        amount_rupees: total / 100,
        taxable_paise: taxable ?? total,
        cgst_paise: c,
        sgst_paise: s,
        igst_paise: ig,
        tax_paise: c + s + ig,
        items,
        reason: r.reason ?? null,
        return_date: r.returned_on,
        created_at: toIso(r.created_at) ?? r.returned_on
      };
    });
    return (this.memo.returns = out);
  }

  transactions(): Transaction[] {
    if (this.memo.tx) return this.memo.tx;
    const pays = this.payments();
    const rets = this.returns();
    const out = this.rawBills().map(b => this.toTransaction(b, pays, rets));
    return (this.memo.tx = out);
  }

  stockMovements(): StockMovement[] {
    if (this.memo.stockMovements) return this.memo.stockMovements;
    const out = [...this.raw.stockMovements.values()].map(r => ({
      id: r.id,
      shop_id: this.shopId!,
      item_name: r.item_name,
      movement_type: r.movement_type,
      qty: Number(r.qty) || 0,
      rate_paise: r.rate_paise != null ? Number(r.rate_paise) : undefined,
      ref_id: r.ref_id ?? null,
      ref_no: r.ref_no ?? null,
      date: r.date || (toIso(r.created_at)?.slice(0, 10) ?? todayIST()),
      notes: r.notes ?? null,
      created_at: toIso(r.created_at) ?? r.date
    }));
    return (this.memo.stockMovements = out);
  }

  rawMaterials(): RawMaterial[] { return []; }
  rawMaterialTx(): RawMaterialTx[] { return []; }
  weavers(): Weaver[] { return []; }
  ownLooms(): OwnLoomRegister | null { return null; }
  weaverTx(): WeaverTransaction[] { return []; }
  staff(): Staff[] { return []; }
  staffRecords(): StaffRecord[] { return []; }

  polishing(): PolishingBatch[] {
    if (this.memo.polishing) return this.memo.polishing;
    const out = [...this.raw.polishing.values()].map(r => ({
      id: r.id,
      shop_id: this.shopId!,
      person_name: r.person_name,
      item_name: r.item_name || 'Silk Saree',
      sarees_sent: Number(r.sarees_sent) || 0,
      sarees_received: Number(r.sarees_received) || 0,
      unit_price_paise: Number(r.unit_price_paise) || 0,
      total_amount_paise: Number(r.total_amount_paise) || ((Number(r.sarees_sent) || 0) * (Number(r.unit_price_paise) || 0)),
      sent_date: r.sent_date || (toIso(r.created_at)?.slice(0, 10) ?? todayIST()),
      received_date: r.received_date ?? null,
      status: r.status || 'PENDING',
      notes: r.notes ?? null,
      created_at: toIso(r.created_at) ?? r.sent_date,
      updated_at: toIso(r.updated_at) ?? undefined
    }));
    return (this.memo.polishing = out);
  }

  private toParty(p: Raw): Party {
    return {
      id: p.id,
      shop_id: this.shopId!,
      name: p.name,
      type: p.type,
      owner_name: p.owner_name ?? '',
      phone: p.phone,
      additional_phones: p.additional_phones ?? [],
      gstin: p.gstin ?? null,
      address: p.address ?? '',
      state: p.state ?? '',
      state_code: p.state_code ?? '',
      pin_code: p.pin_code ?? '',
      notes: p.notes ?? null,
      loom_type: p.loom_type ?? (p.type === 'ARTISAN' ? 'HANDLOOM' : undefined),
      looms_count: p.looms_count != null ? Number(p.looms_count) : (p.type === 'ARTISAN' ? 1 : undefined),
      joined_on: p.joined_on ?? (toIso(p.created_at) ?? '').slice(0, 10),
      created_at: toIso(p.created_at) ?? p.joined_on ?? new Date().toISOString(),
      updated_at: toIso(p.updated_at) ?? undefined
    };
  }

  private toPayment(p: Raw): PaymentRecord {
    const party = this.raw.parties.get(p.party_id);
    const rawDate = p.payment_date || (p.mode === 'NEFT' ? p.txn_date : p.mode === 'CHEQUE' ? p.cheque_date : p.paid_on);
    const createdDate = toIso(p.created_at)?.slice(0, 10);
    const payment_date = rawDate || createdDate || (typeof p.created_at === 'string' ? p.created_at.slice(0, 10) : '') || todayIST();

    return {
      id: p.id,
      shop_id: this.shopId!,
      transaction_id: p.bill_id,
      party_id: p.party_id,
      party_name: party?.name ?? p.party_name,
      party_type: party?.type,
      amount_paise: p.amount,
      amount_rupees: p.amount / 100,
      payment_mode: p.mode,
      payment_date,
      reference_number: p.utr_no ?? null,
      cheque_number: p.cheque_no ?? null,
      cheque_date: p.cheque_date ?? null,
      deposit_date: p.deposit_date ?? null,
      clearing_status: p.mode === 'CHEQUE' ? (p.clearing_status ?? 'PENDING') : null,
      collected_by: p.collected_by ?? null,
      notes: p.notes ?? null,
      created_at: toIso(p.created_at) ?? payment_date
    };
  }

  private toTransaction(b: Raw, pays: PaymentRecord[], rets: ReturnRecord[]): Transaction {
    const party = this.raw.parties.get(b.party_id);
    const legacyHsn = b.kind !== 'JOB_WORK' ? (b.hsn_code ?? null) : null;
    const items: TransactionItem[] = (b.items as BillItemDoc[]).map((it, i) => ({
      id: `${b.id}-${i}`,
      transaction_id: b.id,
      item_name: it.name,
      quantity: it.qty,
      rate_paise: it.rate,
      gst_rate_bp: b.gst_bp,
      amount_paise: it.line_total,
      hsn_code: b.kind === 'JOB_WORK' ? null : (it.hsn_code ?? legacyHsn)
    }));
    const due: number = b.amount_due;
    let status: PaymentStatus = 'PENDING';
    if (due <= 0) status = 'SETTLED';
    else if (b.paid_total > 0 || b.returned_total > 0) status = 'PARTIAL';
    const partyPhone = b.party_phone ?? b.customer_phone ?? party?.phone ?? null;
    return {
      id: b.id,
      shop_id: this.shopId!,
      party_id: b.party_id,
      party_name: party?.name ?? b.party_name ?? b.customer_name ?? 'Party',
      party_phone: partyPhone,
      customer_name: b.customer_name ?? (b.kind === 'JOB_WORK' ? b.party_name : null),
      customer_phone: partyPhone,
      party_type: party?.type ?? b.party_type ?? 'CUSTOMER',
      type: b.kind,
      invoice_number: b.invoice_prefix ? `${b.invoice_prefix}${b.invoice_no}` : String(b.invoice_no),
      invoice_prefix: b.invoice_prefix ?? null,
      invoice_date: b.bill_date,
      due_date: b.remind_on ?? null,
      subtotal_paise: b.subtotal,
      tax_paise: b.cgst + b.sgst + b.igst,
      cgst_paise: b.cgst,
      sgst_paise: b.sgst,
      igst_paise: b.igst,
      grand_total_paise: b.grand_total,
      paid_paise: b.paid_total,
      return_paise: b.returned_total,
      pending_paise: Math.max(0, due),
      status,
      hsn_code: null,
      items,
      payments: pays.filter(p => p.transaction_id === b.id),
      returns: rets.filter(r => r.transaction_id === b.id),
      notes: b.notes ?? null,
      created_at: toIso(b.created_at) ?? b.bill_date,
      updated_at: toIso(b.updated_at) ?? undefined
    };
  }
}

export const cache = new ShopCache();
