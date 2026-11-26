import React, { useState } from 'react';
import { Download, FileText, Filter, Search, X } from 'lucide-react';
import { TallyFilter, TallyShowType } from '@yorbalance/shared';
import { todayIST } from '../../lib/data/util';
import { Sheet } from '../ui/Sheet';

export type DatePreset = 'today' | '7d' | 'month' | 'fy2627' | 'custom';

export interface PartyOption {
  id: string;
  name: string;
  role?: string;
}

interface Props {
  filter: TallyFilter;
  parties: PartyOption[];
  partyLabel?: string;
  onApply: (next: TallyFilter) => void;
  onExportCsv: () => void;
  onExportPdf: () => void;
}

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function presetRange(preset: Exclude<DatePreset, 'custom'>): { from: string; to: string } {
  const today = todayIST();
  if (preset === 'today') return { from: today, to: today };
  if (preset === '7d') return { from: addDays(today, -6), to: today };
  if (preset === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: '2026-04-01', to: '2027-03-31' };
}

export function detectPreset(f: TallyFilter): DatePreset {
  const today = todayIST();
  if (f.from === today && f.to === today) return 'today';
  if (f.from === addDays(today, -6) && f.to === today) return '7d';
  if (f.from === `${today.slice(0, 7)}-01` && f.to === today) return 'month';
  if (f.from === '2026-04-01' && f.to === '2027-03-31') return 'fy2627';
  return 'custom';
}

export const TallyFilters: React.FC<Props> = ({ filter, parties, partyLabel = 'Person / Party', onApply, onExportCsv, onExportPdf }) => {
  const [draft, setDraft] = useState<TallyFilter>(filter);
  const [partyQuery, setPartyQuery] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  React.useEffect(() => {
    setDraft(filter);
  }, [filter.from, filter.to, filter.hsn, filter.partyId, filter.type]);

  const preset = detectPreset(draft);
  const filteredParties = parties.filter(p =>
    !partyQuery.trim() || p.name.toLowerCase().includes(partyQuery.trim().toLowerCase())
  );

  const selectPreset = (p: DatePreset) => {
    if (p === 'custom') return;
    const r = presetRange(p);
    setDraft(d => ({ ...d, from: r.from, to: r.to }));
  };

  const applyDraft = () => {
    onApply(draft);
    setSheetOpen(false);
  };

  const tags: Array<{ key: string; label: string; clear: () => void }> = [];
  if (filter.from || filter.to) {
    tags.push({
      key: 'date',
      label: `Date: ${filter.from || '…'} → ${filter.to || '…'}`,
      clear: () => onApply({ ...filter, from: undefined, to: undefined })
    });
  }
  if (filter.hsn?.trim()) {
    tags.push({
      key: 'hsn',
      label: `HSN: ${filter.hsn.trim()}*`,
      clear: () => onApply({ ...filter, hsn: undefined })
    });
  }
  if (filter.partyId) {
    const pName = parties.find(p => p.id === filter.partyId)?.name ?? filter.partyId;
    tags.push({
      key: 'party',
      label: `Person: ${pName}`,
      clear: () => onApply({ ...filter, partyId: undefined })
    });
  }
  if (filter.type && filter.type !== 'ALL') {
    const typeLabels: Record<string, string> = {
      SALES: 'Sales',
      PURCHASES: 'Purchases',
      PRODUCTION: 'Production',
      BOTH: 'Sales + Production'
    };
    tags.push({
      key: 'type',
      label: `Show: ${typeLabels[filter.type] ?? filter.type}`,
      clear: () => onApply({ ...filter, type: 'ALL' })
    });
  }

  const chips: Array<{ id: Exclude<DatePreset, 'custom'>; label: string }> = [
    { id: 'today', label: 'Today' },
    { id: '7d', label: '7 days' },
    { id: 'month', label: 'This month' },
    { id: 'fy2627', label: 'FY 26-27' }
  ];

  const controls = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => selectPreset(c.id)}
            className={`h-8 px-3 rounded-full text-xs font-semibold border transition-colors ${
              preset === c.id
                ? 'bg-indigo-700 text-white border-indigo-700'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {c.label}
          </button>
        ))}
        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          <input
            type="date"
            aria-label="From date"
            value={draft.from ?? ''}
            onChange={e => setDraft(d => ({ ...d, from: e.target.value || undefined }))}
            className="h-9 px-2.5 rounded-xl border border-slate-300 text-xs bg-white"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            aria-label="To date"
            value={draft.to ?? ''}
            onChange={e => setDraft(d => ({ ...d, to: e.target.value || undefined }))}
            className="h-9 px-2.5 rounded-xl border border-slate-300 text-xs bg-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 items-end">
        <label className="text-xs font-bold uppercase text-slate-600">
          HSN code (prefix)
          <input
            type="text"
            value={draft.hsn ?? ''}
            onChange={e => setDraft(d => ({ ...d, hsn: e.target.value.replace(/[^\d]/g, '') }))}
            placeholder="e.g. 50 matches 5007"
            className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-mono focus:border-indigo-600 focus:outline-none"
          />
        </label>

        <div className="text-xs font-bold uppercase text-slate-600">
          <span>{partyLabel}</span>
          <div className="mt-1 space-y-1">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-slate-400" />
              <input
                type="text"
                value={partyQuery}
                onChange={e => setPartyQuery(e.target.value)}
                placeholder="Search party..."
                className="w-full h-9 pl-8 pr-2 rounded-t-xl border border-b-0 border-slate-300 bg-slate-50 text-xs font-normal focus:outline-none"
              />
            </div>
            <select
              aria-label="Select person or party"
              value={draft.partyId ?? ''}
              onChange={e => setDraft(d => ({ ...d, partyId: e.target.value || undefined }))}
              className="w-full h-10 px-2.5 rounded-b-xl border border-slate-300 bg-white text-sm font-normal focus:border-indigo-600 focus:outline-none"
            >
              <option value="">All {partyLabel.toLowerCase()}s</option>
              {filteredParties.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.role ? ` (${p.role})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-xs font-bold uppercase text-slate-600">
          <span>Show</span>
          <div className="mt-1 grid grid-cols-4 rounded-xl border border-slate-300 bg-slate-50 p-1 h-10">
            {(['SALES', 'PURCHASES', 'PRODUCTION', 'ALL'] as TallyShowType[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setDraft(d => ({ ...d, type: t }))}
                className={`rounded-lg text-xs font-semibold transition-colors ${
                  (draft.type ?? 'ALL') === t ? 'bg-indigo-700 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t === 'SALES' ? 'Sales' : t === 'PURCHASES' ? 'Purchases' : t === 'PRODUCTION' ? 'Production' : 'All'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={applyDraft}
            className="h-10 px-4 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-bold"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            className="h-10 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            type="button"
            onClick={onExportPdf}
            className="h-10 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1"
          >
            <FileText className="w-3.5 h-3.5" /> PDF
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
      <div className="hidden md:block">{controls}</div>

      <div className="md:hidden flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex-1 h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold flex items-center justify-center gap-2"
        >
          <Filter className="w-4 h-4 text-indigo-700" />
          <span>Tally filters</span>
        </button>
        <button type="button" onClick={onExportCsv} className="h-11 px-3 rounded-xl border border-slate-300 bg-white text-xs font-semibold">
          CSV
        </button>
        <button type="button" onClick={onExportPdf} className="h-11 px-3 rounded-xl border border-slate-300 bg-white text-xs font-semibold">
          PDF
        </button>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {tags.map(tg => (
            <span
              key={tg.key}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-800 text-xs font-semibold"
            >
              {tg.label}
              <button type="button" aria-label={`Remove ${tg.label}`} onClick={tg.clear} className="hover:text-indigo-950">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {sheetOpen && (
        <Sheet onClose={() => setSheetOpen(false)} title="Tally filters">
          <div className="p-4">{controls}</div>
        </Sheet>
      )}
    </div>
  );
};
