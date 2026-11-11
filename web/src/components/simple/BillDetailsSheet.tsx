import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Undo2, Trash2, AlertTriangle, FileText, Share2, BookOpen, Pencil } from 'lucide-react';
import { formatPaiseToINR, getStateByCode, Transaction } from '@yorbalance/shared';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';
import { cache } from '../../lib/data/cache';
import { todayIST } from '../../lib/data/util';
import { billMessage, openWhatsApp } from '../../lib/whatsapp';
import { openBillPdf, shareBillPdf } from '../../lib/pdf';
import { Sheet } from '../ui/Sheet';
import { AddReturnModal } from '../history/AddReturnModal';
import { useShell } from '../layout/AppShell';
import { statusOf } from './BillRow';

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—');
const BADGE: Record<string, string> = {
  SETTLED: 'bg-emerald-100 text-emerald-800', PENDING: 'bg-amber-100 text-amber-900', PARTIAL: 'bg-sky-100 text-sky-900', OVERDUE: 'bg-rose-100 text-rose-800'
};

/** §9.4 transaction details with the permitted actions. */
export const BillDetailsSheet: React.FC<{ bill: Transaction; onClose: () => void }> = ({ bill, onClose }) => {
  const { t } = useI18n();
  const { shop } = useAuth();
  const shell = useShell();
  const navigate = useNavigate();
  const [returnOpen, setReturnOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const raw = cache.rawBill(bill.id);
  const [remindOn, setRemindOn] = useState<string>(raw?.remind_on ?? '');
  const [lead, setLead] = useState<number>(raw?.remind_lead_days ?? 3);
  const [notes, setNotes] = useState<string>(raw?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const rs = (p: number) => formatPaiseToINR(p, true);
  const party = cache.rawParty(bill.party_id);
  const returnedQty: Record<string, number> = raw?.returned_qty ?? {};
  const canReturn = (bill.items ?? []).some((it, i) => it.quantity - (returnedQty[String(i)] ?? 0) > 0);
  const moneyMoved = bill.paid_paise > 0 || (bill.return_paise ?? 0) > 0;
  const incoming = bill.type === 'SALE';
  const credit = raw ? Math.max(0, -raw.amount_due) : 0;
  const st = statusOf(bill);
  const pct = (raw?.gst_bp ?? 0) / 100;

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); } catch (e: any) { setError(e.message); }
  };

  const row = (label: string, value: React.ReactNode, strong = false) => (
    <div className={`flex justify-between gap-3 ${strong ? 'text-lg font-bold text-slate-900' : 'text-base text-slate-700'}`}>
      <span>{label}</span><span className="text-right">{value}</span>
    </div>
  );

  return (
    <>
      <Sheet title={`${t(`kind_${bill.type}` as any)} #${bill.invoice_number}`} onClose={onClose} wide>
        <div className="p-4 sm:p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xl font-bold text-slate-900">{bill.party_name}</p>
              <p className="text-base text-slate-600">{t(`type_${party?.type ?? bill.party_type}` as any)} · {party?.phone ?? ''}</p>
              <p className="text-sm text-slate-500">{party?.gstin ?? '—'} · {getStateByCode(party?.state_code ?? '')?.name ?? '—'}</p>
              <p className="text-base text-slate-700 mt-1">{t('date')}: <b>{bill.invoice_date}</b> · {raw?.tax_mode === 'INTER' ? t('other_state') : t('same_state')}</p>
            </div>
            <span className={`shrink-0 px-3 py-1 rounded-full text-sm font-bold ${BADGE[st]}`}>{t(`status_${st}` as any)}</span>
          </div>
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-base flex gap-2"><AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /> {error}</div>
          )}

          {/* Items */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200" data-no-swipe>
            <table className="min-w-full">
              <thead className="bg-slate-50 text-left text-sm text-slate-600">
                <tr><th className="px-3 py-2">{t('item_name')}</th><th className="px-3 py-2 text-right">{t('qty')}</th><th className="px-3 py-2 text-right">{t('rate')}</th><th className="px-3 py-2 text-right">{t('line_total')}</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(bill.items ?? []).map((it, i) => (
                  <tr key={it.id}>
                    <td className="px-3 py-2 text-base">{it.item_name}{(returnedQty[String(i)] ?? 0) > 0 && <span className="block text-sm text-slate-500">{t('returned')}: {returnedQty[String(i)]}</span>}</td>
                    <td className="px-3 py-2 text-base text-right">{it.quantity}</td>
                    <td className="px-3 py-2 text-base text-right whitespace-nowrap">{rs(it.rate_paise)}</td>
                    <td className="px-3 py-2 text-base text-right whitespace-nowrap font-semibold">{rs(it.amount_paise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* GST breakdown and dues (§10.3) */}
          <div className="space-y-1">
            {row(t('items_total'), rs(bill.subtotal_paise))}
            {bill.igst_paise > 0 || raw?.tax_mode === 'INTER'
              ? row(`IGST ${pct}%`, rs(bill.igst_paise))
              : <>{row(`CGST ${pct / 2}%`, rs(bill.cgst_paise))}{row(`SGST ${pct / 2}%`, rs(bill.sgst_paise))}</>}
            {row(t('bill_total'), rs(bill.grand_total_paise), true)}
            {row(t('returned'), `− ${rs(bill.return_paise ?? 0)}`)}
            {row(t('paid'), `− ${rs(bill.paid_paise)}`)}
            {row(t('remaining'), rs(bill.pending_paise), true)}
            {credit > 0 && row(t('credit'), rs(credit))}
            {raw?.remind_on && row(t('reminder'), `${raw.remind_on} · ${raw.remind_lead_days ? t('days_before', { n: raw.remind_lead_days }) : t('on_the_day')}`)}
            {raw?.notes && row(t('notes'), raw.notes)}
            <p className="pt-1 text-sm text-slate-500">{t('created_on', { date: fmt(bill.created_at) })} · {t('updated_on', { date: fmt(bill.updated_at) })}</p>
          </div>

          {/* Payments */}
          {!!bill.payments?.length && (
            <section>
              <h3 className="text-base font-bold text-slate-900 mb-2">{t('money_list')}</h3>
              <div className="space-y-2">
                {bill.payments.map(p => (
                  <div key={p.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex justify-between text-base"><span className="font-semibold">{t(`mode_${p.payment_mode}` as any)} · {p.payment_date}</span><span className="font-bold">{rs(p.amount_paise)}</span></div>
                    <p className="text-sm text-slate-500">
                      {p.payment_mode === 'NEFT' && `UTR ${p.reference_number}`}
                      {p.payment_mode === 'CHEQUE' && `${t('cheque_no')} ${p.cheque_number ?? '—'} · ${t('deposit_date')} ${p.deposit_date ?? '—'}`}
                      {p.payment_mode === 'CASH' && `${t('collected_by')} ${p.collected_by ?? '—'}`}
                    </p>
                    {p.payment_mode === 'CHEQUE' && p.clearing_status === 'PENDING' && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-sm text-amber-800 flex-1">{t('cheque_pending')}</span>
                        <button onClick={() => act(() => api.updateChequeStatus(p.id, { deposit_date: p.deposit_date ?? todayIST() }))} className="h-10 px-3 rounded-lg border-2 border-slate-300 text-sm font-bold">{t('deposit_date')}: {todayIST()}</button>
                        <button onClick={() => act(() => api.updateChequeStatus(p.id, { clearing_status: 'CLEARED', clearing_date: todayIST() }))} className="h-10 px-3 rounded-lg bg-emerald-700 text-white text-sm font-bold">{t('mark_cleared')}</button>
                        <button onClick={() => act(() => api.updateChequeStatus(p.id, { clearing_status: 'BOUNCED' }))} className="h-10 px-3 rounded-lg border-2 border-rose-300 text-rose-700 text-sm font-bold">{t('mark_bounced')}</button>
                      </div>
                    )}
                    {p.clearing_status === 'CLEARED' && <p className="text-sm font-semibold text-emerald-700">{t('mark_cleared')}</p>}
                    {p.clearing_status === 'BOUNCED' && <p className="text-sm font-bold text-rose-700">{t('mark_bounced')}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Returns */}
          {!!bill.returns?.length && (
            <section>
              <h3 className="text-base font-bold text-slate-900 mb-2">{t('returns_list')}</h3>
              {bill.returns.map(r => (
                <div key={r.id} className="p-3 mb-2 rounded-xl bg-slate-50 border border-slate-200 flex justify-between text-base">
                  <span>{r.return_date}{r.reason ? ` · ${r.reason}` : ''}</span><span className="font-bold">− {rs(r.amount_paise)}</span>
                </div>
              ))}
            </section>
          )}

          {/* Edit where permitted: reminder and note only (amounts and GST snapshot are immutable). */}
          {editing && (
            <section className="p-3 rounded-2xl border-2 border-slate-200 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-base font-semibold">{t('remind_on')}
                  <input type="date" value={remindOn} onChange={e => setRemindOn(e.target.value)} className="mt-1 w-full h-12 px-3 rounded-xl border-2 border-slate-200" />
                </label>
                <label className="text-base font-semibold">{t('remind_before')}
                  <select value={lead} onChange={e => setLead(Number(e.target.value))} disabled={!remindOn} className="mt-1 w-full h-12 px-3 rounded-xl border-2 border-slate-200">
                    <option value={0}>{t('on_the_day')}</option><option value={1}>{t('one_day_before')}</option>
                    <option value={3}>{t('days_before', { n: 3 })}</option><option value={7}>{t('days_before', { n: 7 })}</option>
                  </select>
                </label>
              </div>
              <label className="block text-base font-semibold">{t('notes')}
                <input value={notes} onChange={e => setNotes(e.target.value)} className="mt-1 w-full h-12 px-3 rounded-xl border-2 border-slate-200" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setEditing(false)} className="h-12 rounded-xl border-2 border-slate-300 font-bold">{t('cancel')}</button>
                <button onClick={() => act(async () => { await api.updateBillReminder(bill.id, remindOn || null, remindOn ? lead : null, notes.trim() || null); setEditing(false); })}
                  className="h-12 rounded-xl bg-indigo-700 text-white font-bold">{t('save')}</button>
              </div>
            </section>
          )}

          {/* Actions */}
          <div className="space-y-2">
            {bill.pending_paise > 0 && (
              <button onClick={() => { onClose(); shell.openPayment(bill.id); }}
                className={`w-full h-14 rounded-2xl text-white text-lg font-bold ${incoming ? 'bg-emerald-700' : 'bg-rose-700'}`}>
                {incoming ? t('got_money') : t('gave_money')}
              </button>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button onClick={() => shop && act(() => openBillPdf(shop, bill))} className="h-12 rounded-xl border-2 border-slate-300 text-base font-bold flex items-center justify-center gap-2"><FileText className="w-5 h-5" /> {t('view_pdf')}</button>
              <button onClick={() => shop && act(() => shareBillPdf(shop, bill))} className="h-12 rounded-xl border-2 border-slate-300 text-base font-bold flex items-center justify-center gap-2"><Share2 className="w-5 h-5" /> {t('share')}</button>
              {party?.phone && (
                <button onClick={() => openWhatsApp(party.phone, billMessage(shop?.name ?? '', bill))} className="h-12 rounded-xl bg-[#25D366] text-white text-base font-bold flex items-center justify-center gap-2"><MessageCircle className="w-5 h-5" /> {t('whatsapp')}</button>
              )}
              {canReturn && (
                <button onClick={() => setReturnOpen(true)} className="h-12 rounded-xl border-2 border-slate-300 text-base font-bold flex items-center justify-center gap-2"><Undo2 className="w-5 h-5" /> {t('return_goods')}</button>
              )}
              <button onClick={() => { onClose(); navigate(`/ledger?party=${bill.party_id}`); }} className="h-12 rounded-xl border-2 border-slate-300 text-base font-bold flex items-center justify-center gap-2"><BookOpen className="w-5 h-5" /> {t('open_ledger')}</button>
              <button onClick={() => setEditing(true)} className="h-12 rounded-xl border-2 border-slate-300 text-base font-bold flex items-center justify-center gap-2"><Pencil className="w-5 h-5" /> {t('edit')}</button>
            </div>
            {!moneyMoved && (confirmDelete ? (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-2">
                <p className="text-base text-rose-900">{t('confirm_delete')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setConfirmDelete(false)} className="h-12 rounded-xl border-2 border-slate-300 text-base font-bold">{t('cancel')}</button>
                  <button onClick={() => act(async () => { await api.deleteBill(bill.id); onClose(); })} className="h-12 rounded-xl bg-rose-700 text-white text-base font-bold">{t('delete_bill')}</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="w-full h-12 rounded-xl text-base font-semibold text-rose-700 flex items-center justify-center gap-2"><Trash2 className="w-5 h-5" /> {t('delete_bill')}</button>
            ))}
            {moneyMoved && <p className="text-sm text-slate-500 text-center">{t('cannot_delete')}</p>}
          </div>
        </div>
      </Sheet>
      <AddReturnModal isOpen={returnOpen} onClose={() => setReturnOpen(false)} onSuccess={() => undefined} transaction={bill} />
    </>
  );
};
