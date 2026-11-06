import React from 'react';
import { DateRangeOption } from '@yorbalance/shared';
import { Calendar, RefreshCw } from 'lucide-react';

interface DateRangeFilterProps {
  selectedPeriod: DateRangeOption;
  onPeriodChange: (period: DateRangeOption) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  selectedPeriod,
  onPeriodChange,
  onRefresh,
  isRefreshing = false
}) => {
  const options: { id: DateRangeOption; label: string }[] = [
    { id: 'this_month', label: 'This Month' },
    { id: 'last_30_days', label: 'Last 30 Days' },
    { id: 'this_quarter', label: 'This Quarter' },
    { id: 'this_fy', label: 'FY 2026-27' },
    { id: 'all_time', label: 'All Time' }
  ];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 sm:p-3 rounded-2xl border border-slate-200/80 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 pl-1">
        <Calendar className="w-4 h-4 text-purple-600" />
        <span>Period:</span>
        <div className="flex flex-wrap items-center gap-1">
          {options.map(opt => {
            const isSelected = selectedPeriod === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => onPeriodChange(opt.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  isSelected
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-purple-700 hover:bg-purple-50 transition-colors border border-slate-200 self-end sm:self-auto disabled:opacity-50"
        title="Refresh Analytics Data"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-purple-600' : ''}`} />
        <span>Sync</span>
      </button>
    </div>
  );
};

