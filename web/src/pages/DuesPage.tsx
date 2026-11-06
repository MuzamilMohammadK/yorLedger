import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, MessageCircle } from 'lucide-react';
import { formatPaiseToINR } from '@yorbalance/shared';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useLive } from '../lib/useLiveData';
import { useShell } from '../components/layout/AppShell';
import { BillRow, statusOf } from '../components/simple/BillRow';
import { openWhatsApp, reminderMessage } from '../lib/whatsapp';

type Tab = 'collect' | 'pay' | 'done';

/** Pending money: who owes me, whom I owe, and what is finished. */
export const DuesPage: React.FC = () => {
  const { t } = useI18n();
  const { shop } = useAuth();
  const shell = useShell();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'collect';
  const [q, setQ] = useState('');
  const rs = (p: number) => formatPaiseToINR(p, true);

  const { data: bills } = useLive(() => api.getAllBills(), []);
  const { data: partyData } = useLive(() => api.getParties(), []);
  const phoneOf = useMemo(() => new Map((partyData?.parties ?? []).map(p => [p.id, p.phone])), [partyData]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (bills ?? [])
      .filter(b => (tab === 'collect' ? b.type === 'SALE' && b.pending_paise > 0
        : tab === 'pay' ? b.type !== 'SALE' && b.pending_paise > 0 : b.pending_paise <= 0))
      .filter(b => !needle || b.party_name.toLowerCase().includes(needle) || b.invoice_number.includes(needle))
      // Late first, then oldest bill first, so the urgent ones are on top.
      .sort((a, b) => {
        const la = statusOf(a) === 'OVERDUE' ? 0 : 1, lb = statusOf(b) === 'OVERDUE' ? 0 : 1;
        return la - lb || (tab === 'done' ? b.invoice_date.localeCompare(a.invoice_date) : a.invoice_date.localeCompare(b.invoice_date));
      });
  }, [bills, tab, q]);
  const total = list.reduce((s, b) => s + b.pending_paise, 0);

  const tabs: { id: Tab; label: string; on: string }[] = [
    { id: 'collect', label: t('tab_collect'), on: 'bg-emerald-700 text-white' },
    { id: 'pay', label: t('tab_pay'), on: 'bg-rose-700 text-white' },
    { id: 'done', label: t('tab_done'), on: 'bg-slate-800 text-white' }
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">{t('nav_dues')}</h1>

      <div className="grid grid-cols-3 gap-2" role="tablist">
        {tabs.map(x => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => setParams({ tab: x.id })}
            className={`h-12 rounded-xl text-base font-bold ${tab === x.id ? x.on : 'bg-white border-2 border-slate-200 text-slate-700'}`}>
            {x.label}
          </button>
        ))}
      </div>

      {tab !== 'done' && (
        <div className={`rounded-2xl p-4 ${tab === 'collect' ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'}`}>
          <p className="text-base font-semibold">{tab === 'collect' ? t('to_collect') : t('to_pay')}</p>
          <p className="text-3xl font-extrabold">{rs(total)}</p>
        </div>
      )}

      <div className="relative">
        <Search className="w-5 h-5 absolute left-3 top-3.5 text-slate-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('search_party')}
          className="w-full h-12 pl-10 pr-3 rounded-xl border-2 border-slate-200 bg-white text-base focus:border-indigo-600 focus:outline-none" />
      </div>

      {bills === null && <p className="py-8 text-center text-base text-slate-500">{t('loading')}</p>}
      {bills && !list.length && <p className="py-10 text-center text-lg text-slate-500">{t('nothing_pending')}</p>}

      <div className="space-y-2">
        {list.map(b => (
          <div key={b.id} className="space-y-2">
            <BillRow bill={b} onClick={() => navigate(`/history?bill=${b.id}`)} />
            {tab !== 'done' && (
              <div className="flex gap-2 pl-2">
                <button onClick={() => shell.openPayment(b.id)}
                  className={`flex-1 h-12 rounded-xl text-white text-base font-bold ${tab === 'collect' ? 'bg-emerald-700' : 'bg-rose-700'}`}>
                  {tab === 'collect' ? t('got_money') : t('gave_money')}
                </button>
                {tab === 'collect' && phoneOf.get(b.party_id) && (
                  <button onClick={() => openWhatsApp(phoneOf.get(b.party_id)!, reminderMessage(shop?.name ?? '', b.party_name, b))}
                    className="h-12 px-4 rounded-xl bg-[#25D366] text-white text-base font-bold flex items-center gap-2">
                    <MessageCircle className="w-5 h-5" /> {t('remind')}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
