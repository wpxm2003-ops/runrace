"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { LOCALES, type Locale, translations } from "./translations";

const STORAGE_KEY = "runrace_locale";

function isSupported(value: string | null): value is Locale {
  return value != null && LOCALES.some((l) => l.code === value);
}

/**
 * URL 첫 세그먼트가 지원 언어면 그 언어 — `/en`, `/ja` 같은 언어별 공개 페이지용.
 * 저장된 선호보다 우선한다: 그 URL을 열었다는 것 자체가 그 언어로 보겠다는 뜻이고,
 * 이게 없으면 `/en`에 들어와도 본문만 한국어로 떠서 메타데이터와 어긋난다.
 */
function localeFromPath(pathname: string): Locale | null {
  const first = pathname.split("/")[1];
  return isSupported(first) ? first : null;
}

function getInitialLocale(pathname: string): Locale {
  if (typeof window === "undefined") return "ko";
  const fromPath = localeFromPath(pathname);
  if (fromPath) return fromPath;
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
  const pathname = usePathname();
  const [locale, setLocaleState] = useState<Locale>("ko");

  useEffect(() => {
    setLocaleState(getInitialLocale(pathname));
  }, [pathname]);

  // 크롤러·스크린리더가 읽는 문서 언어. 루트 layout은 정적 내보내기라 로케일을 모르므로
  // (모든 경로가 같은 <html lang>을 굽는다) 여기서 실제 언어로 맞춘다.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

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
