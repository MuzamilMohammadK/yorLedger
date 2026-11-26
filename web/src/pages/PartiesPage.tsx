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

const FILTERS = ['ALL', 'CUSTOMER', 'SUPPLIER'] as const;

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

  // Exact position per party in paise: net receivable/payable per direction after offsetting unused return/advance credit.
  const pos = useMemo(() => {
    const raw = new Map<string, { saleNet: number; purNet: number }>();
    for (const b of bills ?? []) {
      const cur = raw.get(b.party_id) ?? { saleNet: 0, purNet: 0 };
      const due = b.grand_total_paise - (b.return_paise ?? 0) - b.paid_paise;
      if (b.type === 'SALE') cur.saleNet += due;
      else cur.purNet += due;
      raw.set(b.party_id, cur);
    }
    const m = new Map<string, { balance: number; credit: number }>();
    for (const [pid, { saleNet, purNet }] of raw.entries()) {
      const balance = Math.max(0, saleNet) - Math.max(0, purNet);
      const credit = Math.max(0, -saleNet) + Math.max(0, -purNet);
      m.set(pid, { balance, credit });
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
      <span className="block whitespace-nowrap tabular-nums">
        {v.balance > 0 && <span className="block text-sm font-bold text-emerald-700">{t('will_get')} {rs(v.balance)}</span>}
        {v.balance < 0 && <span className="block text-sm font-bold text-rose-700">{t('will_give')} {rs(-v.balance)}</span>}
        {v.balance === 0 && !v.credit && <span className="block text-sm text-slate-500">{t('settled')}</span>}
        {v.credit > 0 && (
          <span
            title="Credit = advance or unused return amount"
            className="block text-xs font-semibold text-indigo-700 cursor-help mt-0.5"
          >
            {t('credit_amount', { amount: rs(v.credit) })}
          </span>
        )}
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
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-slate-900">{t('nav_parties')}</h1>
          <div className="flex gap-2">
            <button onClick={() => setShowCal(!showCal)} aria-pressed={showCal} aria-label={t('join_calendar')}
              className={`h-11 px-3 rounded-xl border-2 text-sm font-semibold flex items-center gap-2 ${showCal ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white'}`}>
              <CalendarDays className="w-5 h-5" /> <span className="hidden sm:inline">{t('join_calendar')}</span>
            </button>
            <button onClick={() => setParams({ new: '1' })} className="h-11 px-4 rounded-xl bg-indigo-700 text-white text-sm font-bold flex items-center gap-2">
              <UserPlus className="w-5 h-5" /> {t('add_party')}
            </button>
          </div>
        </div>

        {(showCal || day) && <JoinDateCalendar counts={joinCounts} selected={day} onSelect={setDay} />}
        {day && <p className="text-sm font-semibold text-indigo-800">{t('parties_on', { date: fmtDate(day) })}</p>}

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`h-10 px-4 shrink-0 rounded-full text-sm font-semibold ${filter === f ? 'bg-indigo-700 text-white' : 'bg-white border-2 border-slate-200 text-slate-700'}`}>
              {t(`types_${f}` as any)}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('search_party')}
            className="w-full h-11 pl-10 pr-3 rounded-xl border-2 border-slate-200 bg-white text-base focus:border-indigo-600 focus:outline-none" />
        </div>
      </div>

      {partyData === null && <p className="py-8 text-center text-base text-slate-500">{t('loading')}</p>}
      {partyData && !parties.length && (
        <p className="p-6 rounded-2xl bg-white border border-dashed border-slate-300 text-center text-base text-slate-600">{t('no_parties')}</p>
      )}

      {/* Container-query responsive list / table (scrolls inside its own area) */}
      {!!list.length && (
        <div className="parties-table-wrap rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
          <div className="parties-head bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-600">
            <div>{t('business_name')}</div>
            <div>{t('col_type')}</div>
            <div>{t('owner_name')}</div>
            <div>{t('mobile')}</div>
            <div>{t('gstin')}</div>
            <div>{t('state')}</div>
            <div>{t('outstanding')}</div>
            <div>{t('joined_date')}</div>
          </div>

          {list.map(p => (
            <div key={p.id} className="min-w-0">
              {/* Desktop Row (>= 860px) */}
              <div onClick={() => openParty(p)} className="parties-desktop-only parties-row hover:bg-slate-50 cursor-pointer text-[14px]">
                <div className="font-bold text-slate-900 line-clamp-2 break-words">{p.name}</div>
                <div className="text-slate-700">{t(`type_${p.type}` as any)}</div>
                <div className="text-slate-700 truncate">{p.owner_name}</div>
                <div className="tx-num text-slate-700">{p.phone}</div>
                <div className="font-mono text-xs text-slate-700 truncate">{p.gstin ?? '—'}</div>
                <div className="text-slate-700 truncate">{getStateByCode(p.state_code)?.name ?? p.state ?? '—'}</div>
                <div className="min-w-[165px] whitespace-nowrap">{balance(p)}</div>
                <div className="tx-num text-slate-600">{fmtDate(p.joined_on)}</div>
              </div>

              {/* Narrow Card (< 860px) */}
              <div className="parties-mobile-card p-3.5 space-y-2">
                <button onClick={() => openParty(p)} className="w-full text-left space-y-1">
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <p className="text-[15px] font-bold text-slate-900 line-clamp-2 break-words min-w-0">{p.name}</p>
                    <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{t(`type_${p.type}` as any)}</span>
                  </div>
                  <p className="text-xs text-slate-600">{p.owner_name} · <span className="tx-num">{p.phone}</span></p>
                  <p className="text-xs text-slate-500">
                    {p.gstin ? <span className="font-mono">{p.gstin}</span> : '—'} · {getStateByCode(p.state_code)?.name ?? p.state ?? '—'} · {t('joined_date')} {fmtDate(p.joined_on)}
                  </p>
                  {balance(p)}
                </button>
                <div className="pt-1 grid grid-cols-3 gap-2">
                  <a href={`tel:${p.phone}`} className="h-10 rounded-xl border-2 border-slate-200 text-sm font-semibold text-slate-700 flex items-center justify-center gap-1"><Phone className="w-4 h-4" /> {t('call')}</a>
                  <a href={`https://wa.me/91${p.phone}`} target="_blank" rel="noopener noreferrer" className="h-10 rounded-xl bg-[#25D366] text-white text-sm font-semibold flex items-center justify-center gap-1"><MessageCircle className="w-4 h-4" /> {t('whatsapp')}</a>
                  <button onClick={() => shell.openNewBill({ partyId: p.id })} className="h-10 rounded-xl bg-indigo-700 text-white text-sm font-semibold flex items-center justify-center gap-1"><Plus className="w-4 h-4" /> {t('new_bill')}</button>
                </div>
              </div>
            </div>
          ))}
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

      <PartyFormModal
        isOpen={formOpen}
        onClose={closeForm}
        initialParty={editing}
        onSuccess={p => { if (!editing) { justOpened.current = true; openParty(p); } }}
      />
    </div>
  );
};
