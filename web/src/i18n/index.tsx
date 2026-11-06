import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { DICTS, EN, Lang, LANGUAGES, StringKey } from './strings';

const STORAGE_KEY = 'yorledger_lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved && saved in DICTS) return saved;
  } catch {
    /* storage unavailable: fall through */
  }
  const nav = (navigator.language || 'en').slice(0, 2) as Lang;
  return nav in DICTS ? nav : 'en';
}

type T = (key: StringKey, vars?: Record<string, string | number>) => string;

const I18nContext = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: T } | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* per-device convenience only */
    }
  }, []);

  const t = useCallback<T>((key, vars) => {
    let s = DICTS[lang][key] ?? EN[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  }, [lang]);

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
};

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

export { LANGUAGES };
export type { Lang, StringKey };
