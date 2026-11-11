import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Users, ShoppingBag, Truck, Search, Phone, MessageCircle } from 'lucide-react';
import { formatPaiseToINR, getStateByCode, partyStatement } from '@yorbalance/shared';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useLive } from '../lib/useLiveData';
import { cache } from '../lib/data/cache';
import { useShell } from '../components/layout/AppShell';
import { CircularPager } from '../components/ledger/CircularPager';
import { BillForm } from '../components/ledger/BillForm';
import { TransactionsTable } from '../components/simple/TransactionsTable';

const VIEW_IDS = ['party', 'sales', 'purchases'] as const;

/** §8 Ledger: circular Party → Sales → Purchases pager; the main bill entry experience. */
export const LedgerPage: React.FC = () => {
  const { t, fmtDate } = useI18n();
  const shell = useShell();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const startView = Math.max(0, VIEW_IDS.indexOf((params.get('view') as any) ?? 'party'));
  const [index, setIndex] = useState(startView);
  const partyId = params.get('party');
  const setParty = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('party', id); else next.delete('party');
    setParams(next, { replace: true });
  };
  const [q, setQ] = useState('');
  const rs = (p: number) => formatPaiseToINR(p, true);

  const { data: partyData } = useLive(() => api.getParties(), []);
  const { data: bills } = useLive(() => api.getAllBills(), []);
  const parties = partyData?.parties ?? [];
  const party = parties.find(p => p.id === partyId) ?? null;

  const statement = useMemo(() => {
    if (!partyId) return [];
    const pb = cache.rawBills().filter(b => b.party_id === partyId);
    const ids = new Set(pb.map(b => b.id));
    return partyStatement(
      pb.map(b => ({ id: b.id, kind: b.kind, invoice_no: String(b.invoice_no), date: b.bill_date, grand_total: b.grand_total })),
      cache.payments().filter(p => ids.has(p.transaction_id ?? '')).map(p => ({ id: p.id, bill_id: p.transaction_id!, date: p.payment_date, amount: p.amount_paise, mode: p.payment_mode })),
      cache.returns().filter(r => ids.has(r.transaction_id)).map(r => ({ id: r.id, bill_id: r.transaction_id, date: r.return_date, total: r.amount_paise }))
    );
  }, [partyId, bills]); // eslint-disable-line react-hooks/exhaustive-deps
  const closing = statement.length ? statement[statement.length - 1].balance : 0;

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, '');
    return parties.filter(p => !needle || p.name.toLowerCase().includes(needle) || p.owner_name.toLowerCase().includes(needle) ||
      (digits.length >= 3 && [p.phone, ...(p.additional_phones ?? [])].some(x => x.includes(digits)))).slice(0, 8);
  }, [parties, q]);

  const recent = (kinds: string[]) => (bills ?? []).filter(b => kinds.includes(b.type) && (!partyId || b.party_id === partyId)).slice(0, 10);
  const onNewParty = () => navigate('/parties?new=1');

  const partyView = (
    <div className="space-y-4">
      {!party ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
          <p className="text-base font-semibold text-slate-800">{t('choose_party_first')}</p>
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-3.5 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('search_party')}
              className="w-full h-12 pl-10 pr-3 rounded-xl border-2 border-slate-200 bg-white text-base focus:border-indigo-600 focus:outline-none" />
          </div>
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {matches.map(p => (
              <button key={p.id} onClick={() => setParty(p.id)} className="w-full min-h-12 px-3 py-2 text-left hover:bg-slate-50">
                <span className="block text-base font-semibold">{p.name}</span>
                <span className="block text-sm text-slate-500">{t(`type_${p.type}` as any)} · {p.phone}</span>
              </button>
            ))}
            {!matches.length && <p className="px-3 py-3 text-base text-slate-500">{t('no_party_found')}</p>}
          </div>
          <button onClick={onNewParty} className="w-full h-12 rounded-xl border-2 border-dashed border-indigo-400 text-indigo-700 text-base font-bold">{t('add_new_party')}</button>
        </div>
      ) : (
        <>
          <div className="rounded-2xl bg-white border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xl font-bold text-slate-900">{party.name}</p>
                <p className="text-base text-slate-600">{t(`type_${party.type}` as any)} · {party.owner_name} · {party.phone}</p>
                <p className="text-sm text-slate-500">{party.gstin ?? '—'} · {getStateByCode(party.state_code)?.name ?? '—'}</p>
              </div>
              <button onClick={() => setParty(null)} className="h-11 px-3 shrink-0 rounded-xl border-2 border-slate-200 text-base font-semibold">{t('change')}</button>
            </div>
            <p className={`mt-2 text-2xl font-extrabold ${closing > 0 ? 'text-emerald-700' : closing < 0 ? 'text-rose-700' : 'text-slate-700'}`}>
              {closing > 0 ? `${t('they_owe')} ${rs(closing)}` : closing < 0 ? `${t('you_owe')} ${rs(-closing)}` : t('all_square')}
            </p>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button onClick={() => setIndex(index + 1)} className="h-12 rounded-xl bg-emerald-700 text-white text-base font-bold">{t('new_sale')}</button>
              <button onClick={() => setIndex(index + 2)} className="h-12 rounded-xl bg-sky-700 text-white text-base font-bold">{t('new_purchase')}</button>
              <a href={`tel:${party.phone}`} className="h-12 rounded-xl border-2 border-slate-200 text-base font-semibold flex items-center justify-center gap-1"><Phone className="w-5 h-5" /> {t('call')}</a>
              <a href={`https://wa.me/91${party.phone}`} target="_blank" rel="noopener noreferrer" className="h-12 rounded-xl bg-[#25D366] text-white text-base font-semibold flex items-center justify-center gap-1"><MessageCircle className="w-5 h-5" /> {t('whatsapp')}</a>
            </div>
          </div>

          <section className="rounded-2xl bg-white border border-slate-200">
            <h2 className="px-4 pt-4 text-lg font-bold text-slate-900">{t('party_ledger')}</h2>
            {!statement.length && <p className="p-4 text-base text-slate-500">{t('no_bills')}</p>}
            <div className="overflow-x-auto" data-no-swipe>
              <table className="min-w-full">
                <thead><tr className="text-left text-sm text-slate-500">
                  <th className="px-4 py-2">{t('col_date')}</th><th className="px-4 py-2">{t('col_details')}</th>
                  <th className="px-4 py-2 text-right">{t('col_amount')}</th><th className="px-4 py-2 text-right">{t('col_balance')}</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {statement.map(r => (
                    <tr key={`${r.type}-${r.id}`} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/history?bill=${r.bill_id}`)}>
                      <td className="px-4 py-3 text-base whitespace-nowrap">{fmtDate(r.date)}</td>
                      <td className="px-4 py-3 text-base">
                        {r.type === 'BILL' ? t(`kind_${r.kind}`) : r.type === 'PAYMENT' ? `${t('entry_payment')} (${t(`mode_${r.detail}` as any)})` : t('entry_return')} · #{r.invoice_no}
                      </td>
                      <td className={`px-4 py-3 text-base text-right whitespace-nowrap font-semibold ${r.amount >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {r.amount >= 0 ? '+' : '−'}{rs(Math.abs(r.amount))}
                      </td>
                      <td className="px-4 py-3 text-base text-right whitespace-nowrap font-bold">{rs(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );

  const billView = (kinds: ('SALE' | 'PURCHASE' | 'JOB_WORK')[], title: string) => (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white border border-slate-200">
        <BillForm key={kinds.join()} parties={parties} kinds={kinds} partyId={partyId} onPartyChange={setParty}
          onScan={shell.openScan} onNewParty={onNewParty} />
      </div>
      <section>
        <h2 className="text-lg font-bold text-slate-900 mb-2">{title}</h2>
        <TransactionsTable rows={recent(kinds)} onOpen={r => navigate(`/history?bill=${r.id}`)} />
      </section>
    </div>
  );

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold text-slate-900">{t('nav_ledger')}</h1>
      <CircularPager
        index={index}
        onIndexChange={setIndex}
        hint={t('swipe_hint')}
        views={[
          { id: 'party', label: t('view_party'), icon: <Users className="w-5 h-5" />, render: () => partyView },
          { id: 'sales', label: t('view_sales'), icon: <ShoppingBag className="w-5 h-5" />, render: () => billView(['SALE'], t('recent_sales')) },
          { id: 'purchases', label: t('view_purchases'), icon: <Truck className="w-5 h-5" />, render: () => billView(['PURCHASE', 'JOB_WORK'], t('recent_purchases')) }
        ]}
      />
    </div>
  );
};
