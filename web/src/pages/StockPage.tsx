import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boxes, Package, Scale, Scissors, Users, Sparkles, BarChart3, RefreshCw } from 'lucide-react';
import { useLive } from '../lib/useLiveData';
import { api } from '../lib/api';
import { todayIST } from '../lib/data/util';
import { StockTallyView } from '../components/stock/StockTallyView';
import { RawMaterialsView } from '../components/stock/RawMaterialsView';
import { WeaversLoomsView } from '../components/stock/WeaversLoomsView';
import { StaffView } from '../components/stock/StaffView';
import { PolishingView } from '../components/stock/PolishingView';
import { StockAnalyticsView } from '../components/stock/StockAnalyticsView';

type Tab = 'tally' | 'materials' | 'weavers' | 'staff' | 'polishing' | 'analytics';

export const StockPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'tally';
  const setTab = (t: Tab) => setParams(t === 'tally' ? {} : { tab: t });

  // Polish & Analysis date filter state
  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const [dateFilter, setDateFilter] = useState({ from: firstOfMonth, to: todayIST() });

  // Live queries
  const [tick, setTick] = useState(0);
  const reload = () => setTick(t => t + 1);

  const { data: tallyData } = useLive(() => api.getStockTally(), [tick]);
  const { data: rawMaterialsData } = useLive(() => api.getRawMaterials(), [tick]);
  const { data: weaversData } = useLive(() => api.getWeavers(), [tick]);
  const { data: ownLoomsData } = useLive(() => api.getOwnLooms(), [tick]);
  const { data: staffData } = useLive(() => api.getStaff(), [tick]);
  const { data: polishingData } = useLive(
    () => api.getPolishing(dateFilter),
    [dateFilter.from, dateFilter.to, tick]
  );
  const { data: analysisData } = useLive(
    () => api.getStockProductionAnalysis(dateFilter),
    [dateFilter.from, dateFilter.to, tick]
  );

  const tally = tallyData ?? [];
  const rawMaterials = rawMaterialsData ?? [];
  const weavers = weaversData ?? [];
  const ownLooms = ownLoomsData ?? null;
  const staff = staffData ?? [];

  const tabs: Array<{ id: Tab; label: string; icon: typeof Package; count?: number }> = [
    { id: 'tally', label: 'Finished Stock', icon: Package, count: tally.length },
    { id: 'materials', label: 'Raw Materials', icon: Scale, count: rawMaterials.length },
    { id: 'weavers', label: 'Weavers & Looms', icon: Scissors, count: weavers.length },
    { id: 'staff', label: 'Staff Register', icon: Users, count: staff.length },
    { id: 'polishing', label: 'Polishing', icon: Sparkles, count: polishingData?.totals.pending_sarees },
    { id: 'analytics', label: 'Stock Analysis', icon: BarChart3 }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-brand-900 flex items-center justify-center text-amber-400 shadow-md shadow-brand-950/20">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Stock & Production</h1>
              <p className="text-xs font-semibold text-slate-500">
                Saree tally, raw silk yarn, weaver looms, staff & polishing
              </p>
            </div>
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

      {/* Tabs Switcher */}
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

      {/* Tab Panels */}
      <div>
        {tab === 'tally' && (
          <StockTallyView items={tally} onRefresh={reload} />
        )}

        {tab === 'materials' && (
          <RawMaterialsView
            materials={rawMaterials}
            weavers={weavers.map(w => w.weaver)}
            onRefresh={reload}
          />
        )}

        {tab === 'weavers' && (
          <WeaversLoomsView
            weavers={weavers}
            ownLooms={ownLooms}
            rawMaterials={rawMaterials}
            onRefresh={reload}
          />
        )}

        {tab === 'staff' && (
          <StaffView staff={staff} onRefresh={reload} />
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

        {tab === 'analytics' && (
          <StockAnalyticsView
            analysis={
              analysisData ?? {
                stock_value_paise: 0,
                sarees_in_stock: 0,
                sarees_with_weavers: 0,
                sarees_at_polishing: 0,
                raw_material_balance_kg: 0,
                monthly_comparison: [],
                polishing_cost_by_person: [],
                raw_material_by_weaver: []
              }
            }
            filter={dateFilter}
            onFilterChange={setDateFilter}
          />
        )}
      </div>
    </div>
  );
};
