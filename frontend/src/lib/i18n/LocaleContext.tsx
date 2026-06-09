"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { LOCALES, type Locale, translations } from "./translations";

const STORAGE_KEY = "runrace_locale";

function isSupported(value: string | null): value is Locale {
  return value != null && LOCALES.some((l) => l.code === value);
}

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "ko";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (isSupported(stored)) return stored;
  // 저장된 선호가 없으면 브라우저 언어로 추측 (예: "zh-CN" → zh, "es-ES" → es)
  const lang = navigator.language.toLowerCase();
  const match = LOCALES.find((l) => lang.startsWith(l.code));
  return match ? match.code : "ko";
}

type LocaleContextValue = {
  locale: Locale;
  t: (typeof translations)["ko"];
  setLocale: (next: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ko");

  useEffect(() => {
    setLocaleState(getInitialLocale());
  }, []);

  const setLocale = useCallback((next: Locale) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLocaleState(next);
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, t: translations[locale], setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
