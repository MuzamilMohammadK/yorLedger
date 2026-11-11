import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '../../i18n';
import { todayIST } from '../../lib/data/util';

const pad = (n: number) => String(n).padStart(2, '0');

/** §7.2 Month calendar with a dot on each date a party was added. Tap a date to filter. */
export const JoinDateCalendar: React.FC<{
  counts: Record<string, number>;   // YYYY-MM-DD -> parties added that day
  selected: string | null;
  onSelect: (date: string | null) => void;
}> = ({ counts, selected, onSelect }) => {
  const { t, lang } = useI18n();
  const today = todayIST();
  const [ym, setYm] = useState(() => (selected ?? today).slice(0, 7));
  const [y, m] = ym.split('-').map(Number);

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(y, m - 1, 1));
    const lead = (first.getUTCDay() + 6) % 7; // Monday first
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`)];
  }, [y, m]);

  const move = (d: number) => {
    const dt = new Date(Date.UTC(y, m - 1 + d, 1));
    setYm(`${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}`);
  };
  const locale = { en: 'en-IN', te: 'te-IN', ta: 'ta-IN', kn: 'kn-IN', hi: 'hi-IN' }[lang];
  const title = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(locale, { weekday: 'narrow', timeZone: 'UTC' }));
  const monthTotal = Object.entries(counts).filter(([d]) => d.startsWith(ym)).reduce((s, [, n]) => s + n, 0);

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-3" data-no-swipe>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => move(-1)} aria-label={t('prev_month')} className="w-11 h-11 rounded-full hover:bg-slate-100 flex items-center justify-center"><ChevronLeft className="w-5 h-5" /></button>
        <div className="text-center">
          <p className="text-base font-bold text-slate-900">{title}</p>
          <p className="text-sm text-slate-500">{t('party_count', { n: monthTotal })}</p>
        </div>
        <button type="button" onClick={() => move(1)} aria-label={t('next_month')} className="w-11 h-11 rounded-full hover:bg-slate-100 flex items-center justify-center"><ChevronRight className="w-5 h-5" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {weekdays.map((w, i) => <span key={i} className="text-sm font-semibold text-slate-500">{w}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const n = counts[d] ?? 0;
          const sel = selected === d;
          return (
            <button key={d} type="button" disabled={!n} onClick={() => onSelect(sel ? null : d)}
              aria-label={n ? `${d}: ${n}` : d} aria-pressed={sel}
              className={`h-11 rounded-xl flex flex-col items-center justify-center text-base
                ${sel ? 'bg-indigo-700 text-white' : n ? 'hover:bg-indigo-50 text-slate-900 font-semibold' : 'text-slate-400'}
                ${d === today && !sel ? 'ring-2 ring-indigo-300' : ''}`}>
              {Number(d.slice(8))}
              <span className={`w-1.5 h-1.5 rounded-full ${n ? (sel ? 'bg-white' : 'bg-indigo-600') : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>
      {selected && (
        <button type="button" onClick={() => onSelect(null)} className="mt-2 w-full h-11 rounded-xl border-2 border-slate-200 text-base font-semibold">{t('show_all')}</button>
      )}
    </div>
  );
};
