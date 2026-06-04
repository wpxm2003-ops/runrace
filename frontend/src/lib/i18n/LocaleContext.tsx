"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { type Locale, translations } from "./translations";

const STORAGE_KEY = "runrace_locale";

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "ko";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "ko" || stored === "en") return stored;
  // 브라우저 언어가 영어권이면 영어 기본값
  const lang = navigator.language.toLowerCase();
  return lang.startsWith("en") ? "en" : "ko";
}

type LocaleContextValue = {
  locale: Locale;
  t: (typeof translations)["ko"];
  toggle: () => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("ko");

  useEffect(() => {
    setLocale(getInitialLocale());
  }, []);

  const toggle = useCallback(() => {
    setLocale((prev) => {
      const next: Locale = prev === "ko" ? "en" : "ko";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, t: translations[locale], toggle }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
