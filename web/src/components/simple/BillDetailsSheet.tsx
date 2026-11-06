import React, { useState } from 'react';
import { MessageCircle, Undo2, Trash2, AlertTriangle } from 'lucide-react';
import { formatPaiseToINR, Transaction } from '@yorbalance/shared';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';
import { cache } from '../../lib/data/cache';
import { todayIST } from '../../lib/data/util';
import { billMessage, openWhatsApp } from '../../lib/whatsapp';
import { Sheet } from '../ledger/NewTransactionModal';
import { AddReturnModal } from '../history/AddReturnModal';
import { useShell } from '../layout/AppShell';

/** Everything about one bill, with the actions a shop needs. */
export const BillDetailsSheet: React.FC<{ bill: Transaction; onClose: () => void }> = ({ bill, onClose }) => {
  const { t } = useI18n();
  const { shop } = useAuth();
  const shell = useShell();
  const [returnOpen, setReturnOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rs = (p: number) => formatPaiseToINR(p, true);
  const party = cache.rawParty(bill.party_id);
  const raw = cache.rawBill(bill.id);
  const returnedQty: Record<string, number> = raw?.returned_qty ?? {};
  const canReturn = (bill.items ?? []).some((it, i) => it.quantity - (returnedQty[String(i)] ?? 0) > 0);
  const moneyMoved = bill.paid_paise > 0 || (bill.return_paise ?? 0) > 0;
  const incoming = bill.type === 'SALE';
  const credit = raw ? Math.max(0, -raw.amount_due) : 0;

  const del = async () => {
    try {
      await api.deleteBill(bill.id);
      onClose();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const cheque = async (paymentId: string, status: 'CLEARED' | 'BOUNCED') => {
    try {
      await api.updateChequeStatus(paymentId, { clearing_status: status, clearing_date: status === 'CLEARED' ? todayIST() : null });
    } catch (e: any) {
      setError(e.message);
    }
  };

  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between ${strong ? 'text-lg font-bold text-slate-900' : 'text-base text-slate-700'}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );

  return (
    <>
      <Sheet title={`${t(`kind_${bill.type}` as any)} #${bill.invoice_number}`} onClose={onClose}>
        <div className="p-4 sm:p-6 space-y-5">
          <div>
            <p className="text-xl font-bold text-slate-900">{bill.party_name}</p>
            <p className="text-base text-slate-600">{bill.invoice_date}{party?.phone ? ` · ${party.phone}` : ''}{party?.gstin ? ` · ${party.gstin}` : ''}</p>
          </div>
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-base flex gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /> {error}
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {(bill.items ?? []).map((it, i) => (
              <div key={it.id} className="p-3 flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-slate-900">{it.item_name}</p>
                  <p className="text-sm text-slate-500">
                    {it.quantity} × {rs(it.rate_paise)}
                    {(returnedQty[String(i)] ?? 0) > 0 && ` · ${t('returned')}: ${returnedQty[String(i)]}`}
                  </p>
                </div>
                <p className="text-base font-bold text-slate-900 shrink-0">{rs(it.amount_paise)}</p>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            {row(t('items_total'), rs(bill.subtotal_paise))}
            {bill.igst_paise > 0 ? row('IGST', rs(bill.igst_paise)) : <>{row('CGST', rs(bill.cgst_paise))}{row('SGST', rs(bill.sgst_paise))}</>}
            {row(t('bill_total'), rs(bill.grand_total_paise), true)}
            {(bill.return_paise ?? 0) > 0 && row(t('returned'), `− ${rs(bill.return_paise!)}`)}
            {bill.paid_paise > 0 && row(t('paid'), `− ${rs(bill.paid_paise)}`)}
            {row(t('remaining'), rs(bill.pending_paise), true)}
            {credit > 0 && row(t('credit'), rs(credit))}
          </div>

          {!!bill.payments?.length && (
            <section>
              <h3 className="text-base font-bold text-slate-900 mb-2">{t('money_list')}</h3>
              <div className="space-y-2">
                {bill.payments.map(p => (
                  <div key={p.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex justify-between text-base">
                      <span className="font-semibold">{t(`mode_${p.payment_mode}` as any)} · {p.payment_date}</span>
                      <span className="font-bold">{rs(p.amount_paise)}</span>
                    </div>
                    <p className="text-sm text-slate-500">
                      {p.reference_number ?? p.cheque_number ?? p.collected_by ?? ''}
                    </p>
                    {p.payment_mode === 'CHEQUE' && p.clearing_status === 'PENDING' && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-sm text-amber-800 flex-1">{t('cheque_pending')}</span>
                        <button onClick={() => cheque(p.id, 'CLEARED')} className="h-10 px-3 rounded-lg bg-emerald-700 text-white text-sm font-bold">{t('mark_cleared')}</button>
                        <button onClick={() => cheque(p.id, 'BOUNCED')} className="h-10 px-3 rounded-lg border-2 border-rose-300 text-rose-700 text-sm font-bold">{t('mark_bounced')}</button>
                      </div>
                    )}
                    {p.clearing_status === 'BOUNCED' && <p className="mt-1 text-sm font-bold text-rose-700">{t('mark_bounced')}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {!!bill.returns?.length && (
            <section>
              <h3 className="text-base font-bold text-slate-900 mb-2">{t('returns_list')}</h3>
              {bill.returns.map(r => (
                <div key={r.id} className="p-3 mb-2 rounded-xl bg-slate-50 border border-slate-200 flex justify-between text-base">
                  <span>{r.return_date}{r.reason ? ` · ${r.reason}` : ''}</span>
                  <span className="font-bold">− {rs(r.amount_paise)}</span>
                </div>
              ))}
            </section>
          )}

          <div className="space-y-2">
            {bill.pending_paise > 0 && (
              <button onClick={() => { onClose(); shell.openPayment(bill.id); }}
                className={`w-full h-14 rounded-2xl text-white text-lg font-bold ${incoming ? 'bg-emerald-700' : 'bg-rose-700'}`}>
                {incoming ? t('got_money') : t('gave_money')}
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              {party?.phone && (
                <button onClick={() => openWhatsApp(party.phone, billMessage(shop?.name ?? '', bill))}
                  className="h-12 rounded-xl bg-[#25D366] text-white text-base font-bold flex items-center justify-center gap-2">
                  <MessageCircle className="w-5 h-5" /> {t('whatsapp')}
                </button>
              )}
              {canReturn && (
                <button onClick={() => setReturnOpen(true)}
                  className="h-12 rounded-xl border-2 border-slate-300 text-base font-bold text-slate-800 flex items-center justify-center gap-2">
                  <Undo2 className="w-5 h-5" /> {t('return_goods')}
                </button>
              )}
            </div>
            {!moneyMoved && (
              confirmDelete ? (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-2">
                  <p className="text-base text-rose-900">{t('confirm_delete')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setConfirmDelete(false)} className="h-12 rounded-xl border-2 border-slate-300 text-base font-bold">{t('cancel')}</button>
                    <button onClick={del} className="h-12 rounded-xl bg-rose-700 text-white text-base font-bold">{t('delete_bill')}</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)}
                  className="w-full h-12 rounded-xl text-base font-semibold text-rose-700 flex items-center justify-center gap-2">
                  <Trash2 className="w-5 h-5" /> {t('delete_bill')}
                </button>
              )
            )}
          </div>
        </div>
      </Sheet>
      <AddReturnModal isOpen={returnOpen} onClose={() => setReturnOpen(false)} onSuccess={() => undefined} transaction={bill} />
    </>
  );
};
