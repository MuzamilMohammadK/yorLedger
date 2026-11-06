import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Phone, MessageCircle, Plus, UserPlus, Pencil } from 'lucide-react';
import { Party, PartyType, formatPaiseToINR } from '@yorbalance/shared';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useLive } from '../lib/useLiveData';
import { useShell } from '../components/layout/AppShell';
import { PartyFormModal } from '../components/parties/PartyFormModal';
import { BillRow } from '../components/simple/BillRow';
import { Sheet } from '../components/ledger/NewTransactionModal';

const FILTERS = ['ALL', 'CUSTOMER', 'SUPPLIER', 'ARTISAN'] as const;

export const PartiesPage: React.FC = () => {
  const { t } = useI18n();
  const shell = useShell();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<typeof FILTERS[number]>('ALL');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Party | null>(null);
  const [viewing, setViewing] = useState<Party | null>(null);
  const formOpen = params.get('new') === '1' || !!editing;
  const rs = (p: number) => formatPaiseToINR(p, true);

  const { data: partyData } = useLive(() => api.getParties(), []);
  const { data: bills } = useLive(() => api.getAllBills(), []);

  // Exact balance per party in paise: + means they owe us, − means we owe them.
  const balance = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bills ?? []) {
      if (b.pending_paise <= 0) continue;
      m.set(b.party_id, (m.get(b.party_id) ?? 0) + (b.type === 'SALE' ? b.pending_paise : -b.pending_paise));
    }
    return m;
  }, [bills]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (partyData?.parties ?? [])
      .filter(p => filter === 'ALL' || p.type === filter)
      .filter(p => !needle || p.name.toLowerCase().includes(needle) || p.owner_name.toLowerCase().includes(needle) ||
        p.phone.includes(needle) || (p.additional_phones ?? []).some(x => x.includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [partyData, filter, q]);

  const balanceLine = (p: Party) => {
    const v = balance.get(p.id) ?? 0;
    if (v > 0) return <p className="text-base font-bold text-emerald-700">{t('will_get')} {rs(v)}</p>;
    if (v < 0) return <p className="text-base font-bold text-rose-700">{t('will_give')} {rs(-v)}</p>;
    return <p className="text-sm text-slate-500">{t('settled')}</p>;
  };

  const closeForm = () => { setEditing(null); if (params.get('new')) setParams({}); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t('nav_parties')}</h1>
        <button onClick={() => setParams({ new: '1' })} className="h-12 px-4 rounded-xl bg-indigo-700 text-white text-base font-bold flex items-center gap-2">
          <UserPlus className="w-5 h-5" /> {t('add_party')}
        </button>
      </div>

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
      {partyData && !partyData.parties.length && (
        <p className="p-6 rounded-2xl bg-white border border-dashed border-slate-300 text-center text-base text-slate-600">{t('no_parties')}</p>
      )}

      <div className="space-y-2">
        {list.map(p => (
          <div key={p.id} className="p-3 rounded-2xl bg-white border border-slate-200">
            <button onClick={() => setViewing(p)} className="w-full text-left">
              <p className="text-lg font-bold text-slate-900">{p.name}</p>
              <p className="text-sm text-slate-500">{t(`type_${p.type}` as any)} · {p.owner_name} · {p.phone}</p>
              {balanceLine(p)}
            </button>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <a href={`tel:${p.phone}`} className="h-12 rounded-xl border-2 border-slate-200 text-base font-semibold text-slate-700 flex items-center justify-center gap-1">
                <Phone className="w-5 h-5" /> {t('call')}
              </a>
              <a href={`https://wa.me/91${p.phone}`} target="_blank" rel="noopener noreferrer"
                className="h-12 rounded-xl bg-[#25D366] text-white text-base font-semibold flex items-center justify-center gap-1">
                <MessageCircle className="w-5 h-5" /> {t('whatsapp')}
              </a>
              <button onClick={() => shell.openNewBill({ partyId: p.id })}
                className="h-12 rounded-xl bg-indigo-700 text-white text-base font-semibold flex items-center justify-center gap-1">
                <Plus className="w-5 h-5" /> {t('new_bill')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {viewing && (
        <Sheet title={viewing.name} onClose={() => setViewing(null)}>
          <div className="p-4 sm:p-6 space-y-4">
            <div className="text-base text-slate-700 space-y-1">
              <p>{t(`type_${viewing.type}` as any)} · {viewing.owner_name}</p>
              <p>{[viewing.phone, ...(viewing.additional_phones ?? [])].join(', ')}</p>
              {viewing.gstin && <p className="font-mono">{viewing.gstin}</p>}
              {viewing.address && <p>{viewing.address}{viewing.pin_code ? ` – ${viewing.pin_code}` : ''}</p>}
              {balanceLine(viewing)}
            </div>
            <button onClick={() => { setEditing(viewing); setViewing(null); }}
              className="w-full h-12 rounded-xl border-2 border-slate-200 text-base font-semibold flex items-center justify-center gap-2">
              <Pencil className="w-5 h-5" /> {t('edit')}
            </button>
            <div className="space-y-2">
              {(bills ?? []).filter(b => b.party_id === viewing.id).map(b => (
                <BillRow key={b.id} bill={b} onClick={() => navigate(`/history?bill=${b.id}`)} />
              ))}
            </div>
          </div>
        </Sheet>
      )}

      <PartyFormModal isOpen={formOpen} onClose={closeForm} onSuccess={() => undefined} initialParty={editing} />
    </div>
  );
};

export type { PartyType };
