import React from 'react';
import { ReportFilterOptions } from '@yorbalance/shared';
import { Search, Calendar, Filter, Download, Printer, RotateCcw } from 'lucide-react';

interface ReportFilterBarProps {
  filters: ReportFilterOptions;
  onChange: (filters: ReportFilterOptions) => void;
  onExportCsv?: () => void;
  onPrint?: () => void;
  showPartySearch?: boolean;
  partySearchPlaceholder?: string;
  loading?: boolean;
}

export const ReportFilterBar: React.FC<ReportFilterBarProps> = ({
  filters,
  onChange,
  onExportCsv,
  onPrint,
  showPartySearch = true,
  partySearchPlaceholder = 'Search party name or GSTIN...',
  loading = false
}) => {
  const currentYear = new Date().getFullYear();
  const fyOptions = [
    `FY ${currentYear - 1}-${(currentYear % 100).toString().padStart(2, '0')}`,
    `FY ${currentYear}-${((currentYear + 1) % 100).toString().padStart(2, '0')}`,
    `FY ${currentYear - 2}-${((currentYear - 1) % 100).toString().padStart(2, '0')}`
  ];

  const handleReset = () => {
    onChange({
      financialYear: fyOptions[1],
      quarter: undefined,
      month: undefined,
      from: undefined,
      to: undefined,
      partySearch: ''
    });
  };

  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm space-y-3.5 print:hidden">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Quick Filter Selectors */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Financial Year */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-sm">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={filters.financialYear || ''}
              onChange={e => onChange({ ...filters, financialYear: e.target.value || undefined, month: undefined, quarter: undefined })}
              className="bg-transparent font-semibold text-slate-700 outline-none cursor-pointer"
            >
              <option value="">All Financial Years</option>
              {fyOptions.map(fy => (
                <option key={fy} value={fy}>{fy}</option>
              ))}
            </select>
          </div>

          {/* Quarter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-sm">
            <span className="text-slate-400 font-medium">Quarter:</span>
            <select
              value={filters.quarter || ''}
              onChange={e => onChange({ ...filters, quarter: e.target.value || undefined, month: undefined })}
              className="bg-transparent font-semibold text-slate-700 outline-none cursor-pointer"
            >
              <option value="">Full Year (All Qtrs)</option>
              <option value="Q1">Q1 (Apr – Jun)</option>
              <option value="Q2">Q2 (Jul – Sep)</option>
              <option value="Q3">Q3 (Oct – Dec)</option>
              <option value="Q4">Q4 (Jan – Mar)</option>
            </select>
          </div>

          {/* Month */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-sm">
            <span className="text-slate-400 font-medium">Month:</span>
            <input
              type="month"
              value={filters.month || ''}
              onChange={e => onChange({ ...filters, month: e.target.value || undefined, quarter: undefined })}
              className="bg-transparent font-semibold text-slate-700 outline-none cursor-pointer text-sm"
            />
          </div>

          {/* Custom Date Range */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-sm">
            <span className="text-slate-400 font-medium">From:</span>
            <input
              type="date"
              value={filters.from || ''}
              onChange={e => onChange({ ...filters, from: e.target.value || undefined })}
              className="bg-transparent font-semibold text-slate-700 outline-none cursor-pointer text-sm"
            />
            <span className="text-slate-400 font-medium ml-1">To:</span>
            <input
              type="date"
              value={filters.to || ''}
              onChange={e => onChange({ ...filters, to: e.target.value || undefined })}
              className="bg-transparent font-semibold text-slate-700 outline-none cursor-pointer text-sm"
            />
          </div>

          {/* Reset button */}
          <button
            onClick={handleReset}
            title="Reset Filters"
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Action Buttons: Export & Print */}
        <div className="flex items-center gap-2 self-end lg:self-auto shrink-0">
          {onExportCsv && (
            <button
              onClick={onExportCsv}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold shadow-xs transition-colors disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export CSV</span>
            </button>
          )}

          {onPrint && (
            <button
              onClick={onPrint}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold shadow-xs transition-colors disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Print / PDF</span>
            </button>
          )}
        </div>
      </div>

      {/* Party Search Bar */}
      {showPartySearch && (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={partySearchPlaceholder}
            value={filters.partySearch || ''}
            onChange={e => onChange({ ...filters, partySearch: e.target.value })}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
          />
        </div>
      )}
    </div>
  );
};

