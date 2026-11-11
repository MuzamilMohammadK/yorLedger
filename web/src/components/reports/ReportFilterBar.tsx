import React, { useState } from 'react';
import { Search, Download, Printer, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { ReportFilterOptions, financialYearOptions } from '@yorbalance/shared';
import { useI18n } from '../../i18n';
import { todayIST } from '../../lib/data/util';
import { Sheet } from '../ui/Sheet';

interface Props {
  filters: ReportFilterOptions;
  onChange: (f: ReportFilterOptions) => void;
  onExportCsv?: () => void;
  onPrint?: () => void;
  loading?: boolean;
  showPartySearch?: boolean;
  periodLabel?: string;
}

type Mode = 'year' | 'quarter' | 'month' | 'range';
const modeOf = (f: ReportFilterOptions): Mode => (f.from || f.to ? 'range' : f.month ? 'month' : f.quarter ? 'quarter' : 'year');

/** §11.2 common report filters: toolbar on desktop, bottom sheet on phones. */
export const ReportFilterBar: React.FC<Props> = ({ filters, onChange, onExportCsv, onPrint, showPartySearch = true, periodLabel }) => {
  const { t } = useI18n();
  const [sheet, setSheet] = useState(false);
  const fys = financialYearOptions(todayIST());
  const mode = modeOf(filters);
  const field = 'w-full h-12 px-3 rounded-xl border-2 border-slate-200 bg-white text-base focus:border-indigo-600 focus:outline-none';

  const setMode = (m: Mode) => {
    const base = { financialYear: filters.financialYear ?? fys[0].value, partySearch: filters.partySearch };
    if (m === 'year') onChange(base);
    if (m === 'quarter') onChange({ ...base, quarter: 'Q1' });
    if (m === 'month') onChange({ ...base, month: todayIST().slice(0, 7) });
    if (m === 'range') onChange({ partySearch: filters.partySearch, from: `${todayIST().slice(0, 7)}-01`, to: todayIST() });
  };

  const fields = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-base font-semibold">{t('report_period')}
        <select value={mode} onChange={e => setMode(e.target.value as Mode)} className={`${field} mt-1`}>
          <option value="year">{t('whole_year')}</option><option value="quarter">{t('quarter')}</option>
          <option value="month">{t('month')}</option><option value="range">{t('custom_range')}</option>
        </select>
      </label>
      {mode !== 'range' && mode !== 'month' && (
        <label className="text-base font-semibold">{t('fy')}
          <select value={filters.financialYear ?? fys[0].value} onChange={e => onChange({ ...filters, financialYear: e.target.value })} className={`${field} mt-1`}>
            {fys.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </label>
      )}
      {mode === 'quarter' && (
        <label className="text-base font-semibold">{t('quarter')}
          <select value={filters.quarter ?? 'Q1'} onChange={e => onChange({ ...filters, quarter: e.target.value })} className={`${field} mt-1`}>
            <option value="Q1">Q1 (Apr–Jun)</option><option value="Q2">Q2 (Jul–Sep)</option>
            <option value="Q3">Q3 (Oct–Dec)</option><option value="Q4">Q4 (Jan–Mar)</option>
          </select>
        </label>
      )}
      {mode === 'month' && (
        <label className="text-base font-semibold">{t('month')}
          <input type="month" value={filters.month ?? ''} onChange={e => onChange({ ...filters, month: e.target.value || undefined })} className={`${field} mt-1`} />
        </label>
      )}
      {mode === 'range' && (
        <>
          <label className="text-base font-semibold">{t('from_date')}<input type="date" value={filters.from ?? ''} onChange={e => onChange({ ...filters, from: e.target.value || undefined })} className={`${field} mt-1`} /></label>
          <label className="text-base font-semibold">{t('to_date')}<input type="date" value={filters.to ?? ''} onChange={e => onChange({ ...filters, to: e.target.value || undefined })} className={`${field} mt-1`} /></label>
        </>
      )}
      {showPartySearch && (
        <label className="text-base font-semibold">{t('party_filter')}
          <div className="relative mt-1">
            <Search className="w-5 h-5 absolute left-3 top-3.5 text-slate-400" />
            <input value={filters.partySearch ?? ''} onChange={e => onChange({ ...filters, partySearch: e.target.value })} placeholder={t('search_party_gstin')} className={`${field} pl-10`} />
          </div>
        </label>
      )}
    </div>
  );

  const actions = (
    <div className="flex flex-wrap gap-2">
      {onExportCsv && <button onClick={onExportCsv} className="h-12 px-4 rounded-xl bg-indigo-700 text-white text-base font-bold flex items-center gap-2"><Download className="w-5 h-5" /> {t('export_csv')}</button>}
      {onPrint && <button onClick={onPrint} className="h-12 px-4 rounded-xl border-2 border-slate-200 bg-white text-base font-semibold flex items-center gap-2"><Printer className="w-5 h-5" /> {t('print')}</button>}
      <button onClick={() => onChange({ financialYear: fys[0].value })} className="h-12 px-4 rounded-xl border-2 border-slate-200 bg-white text-base font-semibold flex items-center gap-2"><RotateCcw className="w-5 h-5" /> {t('reset')}</button>
    </div>
  );

  return (
    <div className="print:hidden">
      {/* Desktop toolbar */}
      <div className="hidden md:block rounded-2xl bg-white border border-slate-200 p-4 space-y-3">{fields}{actions}</div>
      {/* Phones: summary + bottom sheet */}
      <div className="md:hidden flex gap-2">
        <button onClick={() => setSheet(true)} className="flex-1 h-12 px-3 rounded-xl border-2 border-slate-200 bg-white text-base font-semibold flex items-center gap-2 truncate">
          <SlidersHorizontal className="w-5 h-5 shrink-0" /> <span className="truncate">{periodLabel ?? t('filters')}</span>
        </button>
        {onExportCsv && <button onClick={onExportCsv} aria-label={t('export_csv')} className="h-12 w-12 rounded-xl bg-indigo-700 text-white flex items-center justify-center"><Download className="w-5 h-5" /></button>}
      </div>
      {sheet && (
        <Sheet title={t('filters')} onClose={() => setSheet(false)}>
          <div className="p-4 space-y-4">
            {fields}
            {actions}
            <button onClick={() => setSheet(false)} className="w-full h-14 rounded-2xl bg-indigo-700 text-white text-lg font-bold">{t('done')}</button>
          </div>
        </Sheet>
      )}
    </div>
  );
};
