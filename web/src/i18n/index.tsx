import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { DICTS, EN, Lang, LANGUAGES, StringKey } from './strings';

// Per-device preferences (§12.8). Kept in localStorage so they apply before sign-in;
// the Settings page also saves them to the shop's settings document.
const KEYS = { lang: 'yorledger_lang', theme: 'yorledger_theme', date: 'yorledger_date_format', landing: 'yorledger_landing' };

export type Theme = 'light' | 'dark' | 'system';
export type DateFormat = 'DD/MM/YYYY' | 'DD-MMM-YYYY' | 'YYYY-MM-DD';
export const DATE_FORMATS: DateFormat[] = ['DD/MM/YYYY', 'DD-MMM-YYYY', 'YYYY-MM-DD'];
export const LANDING_PAGES = ['/dashboard', '/ledger', '/dues', '/history', '/parties'] as const;

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    if (v && allowed.includes(v)) return v;
  } catch {
    /* storage unavailable */
  }
  return fallback;
}
function write(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* optional */ }
}

function initialLang(): Lang {
  const codes = LANGUAGES.map(l => l.code) as Lang[];
  const nav = (navigator.language || 'en').slice(0, 2) as Lang;
  return read<Lang>(KEYS.lang, codes, codes.includes(nav) ? nav : 'en');
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatDate(iso: string | null | undefined, fmt: DateFormat): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  if (fmt === 'YYYY-MM-DD') return `${y}-${m}-${d}`;
  if (fmt === 'DD-MMM-YYYY') return `${d}-${MON[Number(m) - 1]}-${y}`;
  return `${d}/${m}/${y}`;
}

type T = (key: StringKey, vars?: Record<string, string | number>) => string;
interface Ctx {
  lang: Lang; setLang: (l: Lang) => void; t: T;
  theme: Theme; setTheme: (t: Theme) => void;
  dateFormat: DateFormat; setDateFormat: (f: DateFormat) => void; fmtDate: (iso?: string | null) => string;
  landing: string; setLanding: (p: string) => void;
}
const I18nContext = createContext<Ctx | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [theme, setThemeState] = useState<Theme>(() => read<Theme>(KEYS.theme, ['light', 'dark', 'system'], 'light'));
  const [dateFormat, setDateFormatState] = useState<DateFormat>(() => read<DateFormat>(KEYS.date, DATE_FORMATS, 'DD/MM/YYYY'));
  const [landing, setLandingState] = useState<string>(() => read<string>(KEYS.landing, LANDING_PAGES, '/dashboard'));

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  // Theme: light / dark / follow the device.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  const setLang = useCallback((l: Lang) => { setLangState(l); write(KEYS.lang, l); }, []);
  const setTheme = useCallback((v: Theme) => { setThemeState(v); write(KEYS.theme, v); }, []);
  const setDateFormat = useCallback((v: DateFormat) => { setDateFormatState(v); write(KEYS.date, v); }, []);
  const setLanding = useCallback((v: string) => { setLandingState(v); write(KEYS.landing, v); }, []);

  const t = useCallback<T>((key, vars) => {
    let s = DICTS[lang][key] ?? EN[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  }, [lang]);
  const fmtDate = useCallback((iso?: string | null) => formatDate(iso, dateFormat), [dateFormat]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t, theme, setTheme, dateFormat, setDateFormat, fmtDate, landing, setLanding }}>
      {children}
    </I18nContext.Provider>
  );
};

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

export { LANGUAGES };
export type { Lang, StringKey };
