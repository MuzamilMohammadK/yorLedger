import React, { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Phone, MessageCircle, Plus, UserPlus, Pencil, BookOpen, Trash2, CalendarDays } from 'lucide-react';
import { Party, formatPaiseToINR, getStateByCode } from '@yorbalance/shared';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useLive } from '../lib/useLiveData';
import { useShell } from '../components/layout/AppShell';
import { PartyFormModal } from '../components/parties/PartyFormModal';
import { JoinDateCalendar } from '../components/parties/JoinDateCalendar';
import { TransactionsTable } from '../components/simple/TransactionsTable';
import { Sheet } from '../components/ledger/NewTransactionModal';

const FILTERS = ['ALL', 'CUSTOMER', 'SUPPLIER', 'ARTISAN'] as const;

/** §7 Parties: list, search, type filter, join-date calendar, details and actions. */
export const PartiesPage: React.FC = () => {
  const { t, fmtDate } = useI18n();
  const shell = useShell();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<typeof FILTERS[number]>('ALL');
  const [q, setQ] = useState('');
  const [day, setDay] = useState<string | null>(null);
  const [showCal, setShowCal] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);
  const viewingId = params.get('party');
  const [confirmDel, setConfirmDel] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);
  const formOpen = params.get('new') === '1' || !!editing;
  const rs = (p: number) => formatPaiseToINR(p, true);

  const { data: partyData } = useLive(() => api.getParties(), []);
  const { data: bills } = useLive(() => api.getAllBills(), []);
  const parties = partyData?.parties ?? [];

  // Exact position per party in paise: + they owe us, − we owe them; credit = overpaid after returns (§10.4).
  const pos = useMemo(() => {
    const m = new Map<string, { balance: number; credit: number }>();
    for (const b of bills ?? []) {
      const cur = m.get(b.party_id) ?? { balance: 0, credit: 0 };
      const due = b.grand_total_paise - (b.return_paise ?? 0) - b.paid_paise;
      if (due > 0) cur.balance += b.type === 'SALE' ? due : -due;
      else if (due < 0) cur.credit += -due;
      m.set(b.party_id, cur);
    }
    return m;
  }, [bills]);

  const joinCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of parties) if (p.joined_on) c[p.joined_on] = (c[p.joined_on] ?? 0) + 1;
    return c;
  }, [parties]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, '');
    return parties
      .filter(p => filter === 'ALL' || p.type === filter)
      .filter(p => !day || p.joined_on === day)
      .filter(p => !needle || p.name.toLowerCase().includes(needle) || p.owner_name.toLowerCase().includes(needle) ||
        (digits.length >= 3 && [p.phone, ...(p.additional_phones ?? [])].some(x => x.includes(digits))))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [parties, filter, q, day]);

  const viewing = parties.find(p => p.id === viewingId) ?? null;
  const openParty = (p: Party) => { setConfirmDel(false); setDelError(null); setParams({ party: p.id }); };
  // After saving a new party the form calls onSuccess (opens the party) and then onClose.
  // Both run in the same tick, so onClose must not overwrite the party that was just opened.
  const justOpened = useRef(false);
  const closeForm = () => {
    setEditing(null);
    if (justOpened.current) { justOpened.current = false; return; }
    if (params.get('new')) setParams({});
  };

  const balance = (p: Party) => {
    const v = pos.get(p.id) ?? { balance: 0, credit: 0 };
    return (
      <span className="block">
        {v.balance > 0 && <span className="block text-base font-bold text-emerald-700">{t('will_get')} {rs(v.balance)}</span>}
        {v.balance < 0 && <span className="block text-base font-bold text-rose-700">{t('will_give')} {rs(-v.balance)}</span>}
        {v.balance === 0 && !v.credit && <span className="block text-sm text-slate-500">{t('settled')}</span>}
        {v.credit > 0 && <span className="block text-sm font-semibold text-indigo-700">{t('credit_amount', { amount: rs(v.credit) })}</span>}
      </span>
    );
  };

  const remove = async () => {
    if (!viewing) return;
    setDelError(null);
    try {
      await api.deleteParty(viewing.id);
      setParams({});
    } catch (e: any) {
      setDelError(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-900">{t('nav_parties')}</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowCal(!showCal)} aria-pressed={showCal} aria-label={t('join_calendar')}
            className={`h-12 px-3 rounded-xl border-2 text-base font-semibold flex items-center gap-2 ${showCal ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white'}`}>
            <CalendarDays className="w-5 h-5" /> <span className="hidden sm:inline">{t('join_calendar')}</span>
          </button>
          <button onClick={() => setParams({ new: '1' })} className="h-12 px-4 rounded-xl bg-indigo-700 text-white text-base font-bold flex items-center gap-2">
            <UserPlus className="w-5 h-5" /> {t('add_party')}
          </button>
        </div>
      </div>

      {(showCal || day) && <JoinDateCalendar counts={joinCounts} selected={day} onSelect={setDay} />}
      {day && <p className="text-base font-semibold text-indigo-800">{t('parties_on', { date: fmtDate(day) })}</p>}

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`h-11 px-4 shrink-0 rounded-full text-base font-semibold ${filter === f ? 'bg-indigo-700 text-white' : 'bg-white border-2 border-slate-200 text-slate-700'}`}>
            {t(`types_${f}` as any)}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="w-5 h-5 absolute left-3 top-3.5 text-slate-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('search_party')}
          className="w-full h-12 pl-10 pr-3 rounded-xl border-2 border-slate-200 bg-white text-base focus:border-indigo-600 focus:outline-none" />
      </div>

      {partyData === null && <p className="py-8 text-center text-base text-slate-500">{t('loading')}</p>}
      {partyData && !parties.length && (
        <p className="p-6 rounded-2xl bg-white border border-dashed border-slate-300 text-center text-base text-slate-600">{t('no_parties')}</p>
      )}

      {/* Phones: cards */}
      <div className="md:hidden space-y-2">
        {list.map(p => (
          <div key={p.id} className="p-3 rounded-2xl bg-white border border-slate-200">
            <button onClick={() => openParty(p)} className="w-full text-left">
              <p className="text-lg font-bold text-slate-900">{p.name}</p>
              <p className="text-sm text-slate-600">{t(`type_${p.type}` as any)} · {p.owner_name} · {p.phone}</p>
              <p className="text-sm text-slate-500">
                {p.gstin ? <span className="font-mono">{p.gstin}</span> : '—'} · {getStateByCode(p.state_code)?.name ?? p.state ?? '—'} · {t('joined_date')} {fmtDate(p.joined_on)}
              </p>
              {balance(p)}
            </button>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <a href={`tel:${p.phone}`} className="h-12 rounded-xl border-2 border-slate-200 text-base font-semibold text-slate-700 flex items-center justify-center gap-1"><Phone className="w-5 h-5" /> {t('call')}</a>
              <a href={`https://wa.me/91${p.phone}`} target="_blank" rel="noopener noreferrer" className="h-12 rounded-xl bg-[#25D366] text-white text-base font-semibold flex items-center justify-center gap-1"><MessageCircle className="w-5 h-5" /> {t('whatsapp')}</a>
              <button onClick={() => shell.openNewBill({ partyId: p.id })} className="h-12 rounded-xl bg-indigo-700 text-white text-base font-semibold flex items-center justify-center gap-1"><Plus className="w-5 h-5" /> {t('new_bill')}</button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      {!!list.length && (
        <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {[t('business_name'), t('col_type'), t('owner_name'), t('mobile'), t('gstin'), t('state'), t('outstanding'), t('joined_date')].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-sm font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map(p => (
                <tr key={p.id} onClick={() => openParty(p)} className="hover:bg-slate-50 cursor-pointer">
                  <td className="px-3 py-3 text-base font-semibold">{p.name}</td>
                  <td className="px-3 py-3 text-base">{t(`type_${p.type}` as any)}</td>
                  <td className="px-3 py-3 text-base">{p.owner_name}</td>
                  <td className="px-3 py-3 text-base whitespace-nowrap">{p.phone}</td>
                  <td className="px-3 py-3 text-base font-mono whitespace-nowrap">{p.gstin ?? '—'}</td>
                  <td className="px-3 py-3 text-base">{getStateByCode(p.state_code)?.name ?? p.state ?? '—'}</td>
                  <td className="px-3 py-3">{balance(p)}</td>
                  <td className="px-3 py-3 text-base whitespace-nowrap">{fmtDate(p.joined_on)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewing && (
        <Sheet title={viewing.name} onClose={() => setParams({})}>
          <div className="p-4 sm:p-6 space-y-4">
            <div className="text-base text-slate-700 space-y-1">
              <p className="font-semibold">{t(`type_${viewing.type}` as any)} · {viewing.owner_name}</p>
              <p>{t('all_phones')}: {[viewing.phone, ...(viewing.additional_phones ?? [])].join(', ')}</p>
              <p>{t('gstin')}: <span className="font-mono">{viewing.gstin ?? '—'}</span></p>
              <p>{t('state')}: {getStateByCode(viewing.state_code)?.name ?? viewing.state ?? '—'}</p>
              {viewing.address && <p>{t('address')}: {viewing.address}{viewing.pin_code ? ` – ${viewing.pin_code}` : ''}</p>}
              {viewing.notes && <p>{t('notes')}: {viewing.notes}</p>}
              <p>{t('joined_date')}: {fmtDate(viewing.joined_on)}</p>
              {balance(viewing)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => navigate(`/ledger?party=${viewing.id}`)} className="h-12 rounded-xl bg-indigo-700 text-white text-base font-bold flex items-center justify-center gap-2"><BookOpen className="w-5 h-5" /> {t('open_ledger')}</button>
              <button onClick={() => shell.openNewBill({ partyId: viewing.id })} className="h-12 rounded-xl bg-emerald-700 text-white text-base font-bold flex items-center justify-center gap-2"><Plus className="w-5 h-5" /> {t('new_bill')}</button>
              <a href={`tel:${viewing.phone}`} className="h-12 rounded-xl border-2 border-slate-200 text-base font-semibold flex items-center justify-center gap-2"><Phone className="w-5 h-5" /> {t('call')}</a>
              <a href={`https://wa.me/91${viewing.phone}`} target="_blank" rel="noopener noreferrer" className="h-12 rounded-xl bg-[#25D366] text-white text-base font-semibold flex items-center justify-center gap-2"><MessageCircle className="w-5 h-5" /> {t('whatsapp')}</a>
              <button onClick={() => { setEditing(viewing); setParams({}); }} className="h-12 rounded-xl border-2 border-slate-200 text-base font-semibold flex items-center justify-center gap-2"><Pencil className="w-5 h-5" /> {t('edit')}</button>
              <button onClick={() => setConfirmDel(true)} className="h-12 rounded-xl border-2 border-rose-200 text-rose-700 text-base font-semibold flex items-center justify-center gap-2"><Trash2 className="w-5 h-5" /> {t('delete_party')}</button>
            </div>
            {confirmDel && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-2">
                <p className="text-base text-rose-900">{t('confirm_delete_party')}</p>
                {delError && <p className="text-base font-semibold text-rose-800">{delError}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setConfirmDel(false)} className="h-12 rounded-xl border-2 border-slate-300 text-base font-bold">{t('cancel')}</button>
                  <button onClick={remove} className="h-12 rounded-xl bg-rose-700 text-white text-base font-bold">{t('delete_party')}</button>
                </div>
              </div>
            )}
            <TransactionsTable rows={(bills ?? []).filter(b => b.party_id === viewing.id)} detailed onOpen={r => navigate(`/history?bill=${r.id}`)} />
          </div>
        </Sheet>
      )}

      <PartyFormModal isOpen={formOpen} onClose={closeForm} onSuccess={p => { if (!editing) { justOpened.current = true; openParty(p); } }} initialParty={editing} />
    </div>
  );
};
