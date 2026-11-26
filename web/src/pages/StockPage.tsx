import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boxes, Package, Sparkles, RefreshCw } from 'lucide-react';
import { useLive } from '../lib/useLiveData';
import { api } from '../lib/api';
import { todayIST } from '../lib/data/util';
import { useAuth } from '../context/AuthContext';
import { StockTallyView } from '../components/stock/StockTallyView';
import { PolishingView } from '../components/stock/PolishingView';
import { TallySection } from '../components/tally/TallySection';

type Tab = 'hsn_tally' | 'tally' | 'polishing';

export const StockPage: React.FC = () => {
  const { shop } = useAuth();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const tab: Tab =
    rawTab === 'tally' ? 'tally' :
    rawTab === 'polishing' ? 'polishing' :
    'hsn_tally';
  const setTab = (t: Tab) => setParams(t === 'hsn_tally' ? {} : { tab: t });

  useEffect(() => {
    if (rawTab && rawTab !== 'tally' && rawTab !== 'polishing') {
      setParams({}, { replace: true });
    }
  }, [rawTab, setParams]);

  // Clear removed collections from Firestore once per shop
  useEffect(() => {
    if (!shop?.id) return;
    const key = `yorledger_cleared_removed_stock_${shop.id}`;
    if (localStorage.getItem(key)) return;
    api.clearRemovedStockData()
      .then(() => localStorage.setItem(key, '1'))
      .catch(() => { /* retry next visit */ });
  }, [shop?.id]);

  // Polish date filter state
  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const [dateFilter, setDateFilter] = useState({ from: firstOfMonth, to: todayIST() });

  const [tick, setTick] = useState(0);
  const reload = () => setTick(t => t + 1);

  const { data: tallyData } = useLive(() => api.getStockTally(), [tick]);
  const { data: polishingData } = useLive(
    () => api.getPolishing(dateFilter),
    [dateFilter.from, dateFilter.to, tick]
  );

  const tally = tallyData ?? [];

  const tabs: Array<{ id: Tab; label: string; icon: typeof Package; count?: number }> = [
    { id: 'hsn_tally', label: 'Tally & HSN', icon: Boxes },
    { id: 'tally', label: 'Finished Stock', icon: Package, count: tally.length },
    { id: 'polishing', label: 'Polishing', icon: Sparkles, count: polishingData?.totals.pending_sarees }
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-brand-900 flex items-center justify-center text-amber-400 shadow-md shadow-brand-950/20">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Stock &amp; Production</h1>
              <p className="text-xs font-semibold text-slate-500">
                Tally &amp; HSN balance, finished saree stock, and polishing
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={reload}
            className="h-10 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-2 self-start sm:self-auto shadow-sm transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            <span>Refresh</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 p-1.5 bg-slate-200/70 rounded-2xl overflow-x-auto no-scrollbar">
          {tabs.map(t => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-brand-900' : 'text-slate-400'}`} />
                <span>{t.label}</span>
                {t.count !== undefined && t.count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                      isActive ? 'bg-brand-50 text-brand-900' : 'bg-slate-300 text-slate-700'
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        {tab === 'hsn_tally' && <TallySection />}

        {tab === 'tally' && (
          <StockTallyView items={tally} onRefresh={reload} />
        )}

        {tab === 'polishing' && (
          <PolishingView
            data={
              polishingData ?? {
                batches: [],
                totals: {
                  total_entries: 0,
                  total_sarees_sent: 0,
                  total_sarees_received: 0,
                  pending_sarees: 0,
                  total_cost_paise: 0
                },
                person_summaries: []
              }
            }
            filter={dateFilter}
            onFilterChange={setDateFilter}
            onRefresh={reload}
          />
        )}
      </div>
    </div>
  );
};
