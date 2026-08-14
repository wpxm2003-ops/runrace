"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/app/_components/ui/Skeleton";
import { toast } from "sonner";
import { logout } from "@/lib/auth";
import { useAuthUser } from "@/lib/useAuthUser";
import { LOCALES, type Locale, useLocale } from "@/lib/i18n";
import { useWorkoutSessionContext } from "@/lib/WorkoutSessionProvider";
import { BrandMark } from "@/app/_components/ui/BrandMark";

function LanguagePicker({
  locale,
  setLocale,
  ariaLabel,
}: {
  locale: Locale;
  setLocale: (l: Locale) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex h-11 min-w-11 items-center justify-center rounded-control border px-2.5 text-xs font-bold tracking-wide transition-colors ${open ? "border-ink bg-panel-muted text-ink" : "border-line bg-panel text-muted hover:border-zinc-300 hover:text-ink"}`}
      >
        {locale.toUpperCase()}
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1 min-w-[8rem] overflow-hidden rounded-control border border-line bg-panel py-1 shadow-float">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              type="button"
              role="menuitemradio"
              aria-checked={locale === l.code}
              onClick={() => { setLocale(l.code as Locale); setOpen(false); }}
              className={`flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-panel-muted ${locale === l.code ? "font-semibold text-ink" : "text-muted"}`}
            >
              {locale === l.code && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              )}
              {locale !== l.code && <span className="h-1.5 w-1.5 shrink-0" />}
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppHeader() {
  const { user, loading, hint } = useAuthUser();
  const { locale, t, setLocale } = useLocale();
  const session = useWorkoutSessionContext();

  /**
   * 진행 중인 운동이 있으면 실수로 세션을 중단하지 않도록 UX 단계에서 로그아웃을 막는다.
   * 외부 인증 변경은 세션 계층에서도 소유자 검증 후 원래 계정의 일시정지 기록으로 보존한다.
   */
  function handleLogout() {
    if (session.status !== "idle") {
      toast.error(t.logout_blocked_workout_active);
      return;
    }
    void logout();
  }

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-5 sm:px-6">
        <Link href="/" className="flex min-h-11 items-center" aria-label="RunRace home">
          <BrandMark />
        </Link>
        <div className="flex items-center gap-1.5 text-sm">
          <LanguagePicker locale={locale} setLocale={setLocale} ariaLabel={t.header_language} />
          {user ? (
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-11 items-center rounded-control px-2.5 text-xs font-medium text-muted hover:bg-panel-muted hover:text-ink"
            >
              {t.header_logout}
            </button>
          ) : loading && hint ? (
            <Skeleton className="h-4 w-12" />
          ) : (
            <a
              href="/login"
              className="flex h-11 items-center rounded-control px-2.5 text-xs font-semibold text-muted hover:bg-panel-muted hover:text-ink"
            >
              {t.header_login}
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

/** Backward-compatible name for existing imports. */
export const SiteHeader = AppHeader;
