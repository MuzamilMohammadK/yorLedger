// Live, offline-capable view of one shop's ledger data.
//
// One listener per collection for the whole session: the first load costs one
// read per document, later changes cost one read per changed document, and the
// persistent cache serves restarts. That keeps a small shop well inside the
// Spark free tier (50k reads/day) while every screen reads from memory.
import { collection, onSnapshot, Unsubscribe } from 'firebase/firestore';
import {
  Party, PaymentRecord, ReturnRecord, Transaction, TransactionItem, PaymentStatus,
  StockMovement, RawMaterial, RawMaterialTx, Weaver, OwnLoomRegister,
  WeaverTransaction, Staff, StaffRecord, PolishingBatch
} from '@yorbalance/shared';
import { db } from '../firebase';
import { toIso, todayIST } from './util';

export interface BillItemDoc { name: string; qty: number; rate: number; line_total: number }

type Raw = Record<string, any> & { id: string };

const COLLECTIONS = [
  'parties', 'bills', 'payments', 'returns',
  'stockMovements', 'rawMaterials', 'rawMaterialTx',
  'weavers', 'ownLooms', 'weaverTx', 'staff', 'staffRecords', 'polishing'
] as const;
type Col = typeof COLLECTIONS[number];

class ShopCache {
  private shopId: string | null = null;
  private raw: Record<Col, Map<string, Raw>> = {
    parties: new Map(), bills: new Map(), payments: new Map(), returns: new Map(),
    stockMovements: new Map(), rawMaterials: new Map(), rawMaterialTx: new Map(),
    weavers: new Map(), ownLooms: new Map(), weaverTx: new Map(),
    staff: new Map(), staffRecords: new Map(), polishing: new Map()
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
  rawParty(id: string) { return this.raw.parties.get(id); }
  rawBills() { return [...this.raw.bills.values()].filter(b => !b.deleted_at); }
  rawReturns() { return [...this.raw.returns.values()]; }

  parties(): Party[] {
    if (this.memo.parties) return this.memo.parties;
    const out = [...this.raw.parties.values()].filter(p => !p.deleted_at).map(p => this.toParty(p));
    return (this.memo.parties = out);
  }

  payments(): PaymentRecord[] {
    if (this.memo.payments) return this.memo.payments;
    const out = [...this.raw.payments.values()].map(p => this.toPayment(p));
    return (this.memo.payments = out);
  }

  returns(): ReturnRecord[] {
    if (this.memo.returns) return this.memo.returns;
    const out = [...this.raw.returns.values()].map(r => ({
      id: r.id,
      shop_id: this.shopId!,
      transaction_id: r.bill_id,
      party_id: r.party_id,
      amount_paise: r.total_reduction,
      amount_rupees: r.total_reduction / 100,
      reason: r.reason ?? null,
      return_date: r.returned_on,
      created_at: toIso(r.created_at) ?? r.returned_on
    }));
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

  rawMaterials(): RawMaterial[] {
    if (this.memo.rawMaterials) return this.memo.rawMaterials;
    const out = [...this.raw.rawMaterials.values()].map(r => ({
      id: r.id,
      shop_id: this.shopId!,
      name: r.name,
      unit: r.unit || 'kg',
      unit_price_paise: Number(r.unit_price_paise) || 0,
      low_stock_threshold_kg: r.low_stock_threshold_kg != null ? Number(r.low_stock_threshold_kg) : 5,
      created_at: toIso(r.created_at) ?? new Date().toISOString(),
      updated_at: toIso(r.updated_at) ?? undefined
    }));
    return (this.memo.rawMaterials = out);
  }

  rawMaterialTx(): RawMaterialTx[] {
    if (this.memo.rawMaterialTx) return this.memo.rawMaterialTx;
    const out = [...this.raw.rawMaterialTx.values()].map(r => {
      const mat = this.raw.rawMaterials.get(r.material_id);
      const w = r.weaver_id ? this.raw.weavers.get(r.weaver_id) : null;
      return {
        id: r.id,
        shop_id: this.shopId!,
        material_id: r.material_id,
        material_name: r.material_name || (mat?.name ?? 'Material'),
        tx_type: r.tx_type,
        qty_kg: Number(r.qty_kg) || 0,
        rate_per_kg_paise: Number(r.rate_per_kg_paise) || 0,
        total_amount_paise: Number(r.total_amount_paise) || 0,
        weaver_id: r.weaver_id ?? null,
        weaver_name: r.weaver_name ?? (w?.name ?? null),
        date: r.date || (toIso(r.created_at)?.slice(0, 10) ?? todayIST()),
        ref_no: r.ref_no ?? null,
        notes: r.notes ?? null,
        created_at: toIso(r.created_at) ?? r.date
      };
    });
    return (this.memo.rawMaterialTx = out);
  }

  weavers(): Weaver[] {
    if (this.memo.weavers) return this.memo.weavers;
    const out = [...this.raw.weavers.values()].map(r => ({
      id: r.id,
      shop_id: this.shopId!,
      name: r.name,
      phone: r.phone || '',
      address: r.address || '',
      type: r.type || 'HANDLOOM',
      looms_count: Number(r.looms_count) || 1,
      notes: r.notes ?? null,
      created_at: toIso(r.created_at) ?? new Date().toISOString(),
      updated_at: toIso(r.updated_at) ?? undefined
    }));
    return (this.memo.weavers = out);
  }

  ownLooms(): OwnLoomRegister | null {
    if (this.memo.ownLooms !== undefined) return this.memo.ownLooms;
    const raw = [...this.raw.ownLooms.values()][0];
    if (!raw) return (this.memo.ownLooms = null);
    const out: OwnLoomRegister = {
      id: raw.id,
      shop_id: this.shopId!,
      handloom_running: Number(raw.handloom_running) || 0,
      handloom_idle: Number(raw.handloom_idle) || 0,
      handloom_repair: Number(raw.handloom_repair) || 0,
      powerloom_running: Number(raw.powerloom_running) || 0,
      powerloom_idle: Number(raw.powerloom_idle) || 0,
      powerloom_repair: Number(raw.powerloom_repair) || 0,
      updated_at: toIso(raw.updated_at) ?? new Date().toISOString()
    };
    return (this.memo.ownLooms = out);
  }

  weaverTx(): WeaverTransaction[] {
    if (this.memo.weaverTx) return this.memo.weaverTx;
    const out = [...this.raw.weaverTx.values()].map(r => {
      const w = this.raw.weavers.get(r.weaver_id);
      return {
        id: r.id,
        shop_id: this.shopId!,
        weaver_id: r.weaver_id,
        weaver_name: r.weaver_name ?? (w?.name ?? 'Weaver'),
        action_type: r.action_type,
        date: r.date || (toIso(r.created_at)?.slice(0, 10) ?? todayIST()),
        material_id: r.material_id ?? null,
        material_name: r.material_name ?? null,
        qty_kg: r.qty_kg != null ? Number(r.qty_kg) : undefined,
        unit_price_paise: r.unit_price_paise != null ? Number(r.unit_price_paise) : undefined,
        total_material_paise: r.total_material_paise != null ? Number(r.total_material_paise) : undefined,
        finished_item_name: r.finished_item_name,
        sarees_count: r.sarees_count != null ? Number(r.sarees_count) : undefined,
        wastage_kg: r.wastage_kg != null ? Number(r.wastage_kg) : undefined,
        wage_amount_paise: r.wage_amount_paise != null ? Number(r.wage_amount_paise) : undefined,
        payment_amount_paise: r.payment_amount_paise != null ? Number(r.payment_amount_paise) : undefined,
        payment_mode: r.payment_mode,
        notes: r.notes ?? null,
        created_at: toIso(r.created_at) ?? r.date
      };
    });
    return (this.memo.weaverTx = out);
  }

  staff(): Staff[] {
    if (this.memo.staff) return this.memo.staff;
    const out = [...this.raw.staff.values()].map(r => ({
      id: r.id,
      shop_id: this.shopId!,
      name: r.name,
      role: r.role || 'Staff',
      phone: r.phone || '',
      wage_type: r.wage_type || 'MONTHLY',
      wage_amount_paise: Number(r.wage_amount_paise) || 0,
      joining_date: r.joining_date || (toIso(r.created_at)?.slice(0, 10) ?? todayIST()),
      status: r.status || 'ACTIVE',
      created_at: toIso(r.created_at) ?? new Date().toISOString(),
      updated_at: toIso(r.updated_at) ?? undefined
    }));
    return (this.memo.staff = out);
  }

  staffRecords(): StaffRecord[] {
    if (this.memo.staffRecords) return this.memo.staffRecords;
    const out = [...this.raw.staffRecords.values()].map(r => {
      const s = this.raw.staff.get(r.staff_id);
      return {
        id: r.id,
        shop_id: this.shopId!,
        staff_id: r.staff_id,
        staff_name: r.staff_name ?? (s?.name ?? 'Staff'),
        record_type: r.record_type,
        date: r.date || (toIso(r.created_at)?.slice(0, 10) ?? todayIST()),
        attendance_status: r.attendance_status,
        amount_paise: r.amount_paise != null ? Number(r.amount_paise) : undefined,
        notes: r.notes ?? null,
        created_at: toIso(r.created_at) ?? r.date
      };
    });
    return (this.memo.staffRecords = out);
  }

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
    const items: TransactionItem[] = (b.items as BillItemDoc[]).map((it, i) => ({
      id: `${b.id}-${i}`,
      transaction_id: b.id,
      item_name: it.name,
      quantity: it.qty,
      rate_paise: it.rate,
      gst_rate_bp: b.gst_bp,
      amount_paise: it.line_total
    }));
    const due: number = b.amount_due;
    let status: PaymentStatus = 'PENDING';
    if (due <= 0) status = 'SETTLED';
    else if (b.paid_total > 0 || b.returned_total > 0) status = 'PARTIAL';
    return {
      id: b.id,
      shop_id: this.shopId!,
      party_id: b.party_id,
      party_name: party?.name ?? b.party_name ?? 'Party',
      party_type: party?.type ?? b.party_type,
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
      hsn_code: b.hsn_code ?? null,
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
