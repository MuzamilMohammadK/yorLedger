// Live, offline-capable view of one shop's ledger data.
//
// One listener per collection for the whole session: the first load costs one
// read per document, later changes cost one read per changed document, and the
// persistent cache serves restarts. That keeps a small shop well inside the
// Spark free tier (50k reads/day) while every screen reads from memory.
import { collection, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { Party, PaymentRecord, ReturnRecord, Transaction, TransactionItem, PaymentStatus } from '@yorbalance/shared';
import { db } from '../firebase';
import { toIso } from './util';

export interface BillItemDoc { name: string; qty: number; rate: number; line_total: number }

type Raw = Record<string, any> & { id: string };

const COLLECTIONS = ['parties', 'bills', 'payments', 'returns'] as const;
type Col = typeof COLLECTIONS[number];

class ShopCache {
  private shopId: string | null = null;
  private raw: Record<Col, Map<string, Raw>> = {
    parties: new Map(), bills: new Map(), payments: new Map(), returns: new Map()
  };
  private loaded = new Set<Col>();
  private unsubs: Unsubscribe[] = [];
  private readyResolvers: Array<() => void> = [];
  private readyRejecters: Array<(e: unknown) => void> = [];
  private listeners = new Set<() => void>();
  private memo: { tx?: Transaction[]; parties?: Party[]; payments?: PaymentRecord[]; returns?: ReturnRecord[] } = {};

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
  rawParty(id: string) { return this.raw.parties.get(id); }
  rawBills() { return [...this.raw.bills.values()].filter(b => !b.deleted_at); }

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
      created_at: toIso(p.created_at) ?? p.joined_on ?? new Date().toISOString(),
      updated_at: toIso(p.updated_at) ?? undefined
    };
  }

  private toPayment(p: Raw): PaymentRecord {
    const party = this.raw.parties.get(p.party_id);
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
      payment_date: p.mode === 'NEFT' ? p.txn_date : p.mode === 'CHEQUE' ? p.cheque_date : p.paid_on,
      reference_number: p.utr_no ?? null,
      cheque_number: p.cheque_no ?? null,
      cheque_date: p.cheque_date ?? null,
      deposit_date: p.deposit_date ?? null,
      clearing_status: p.mode === 'CHEQUE' ? (p.clearing_status ?? 'PENDING') : null,
      collected_by: p.collected_by ?? null,
      notes: p.notes ?? null,
      created_at: toIso(p.created_at) ?? p.paid_on
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
      invoice_number: String(b.invoice_no),
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
