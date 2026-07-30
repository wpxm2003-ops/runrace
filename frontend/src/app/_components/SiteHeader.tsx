"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/app/_components/ui/Skeleton";
import { toast } from "sonner";
import { logout } from "@/lib/auth";
import { useAuthUser } from "@/lib/useAuthUser";
import { LOCALES, type Locale, useLocale } from "@/lib/i18n";
import { useWorkoutSessionContext } from "@/lib/WorkoutSessionProvider";

function LanguagePicker({ locale, setLocale }: { locale: Locale; setLocale: (l: Locale) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Change language"
        className={`rounded-lg border px-2 py-1 text-xs font-semibold tracking-wide transition-colors ${open ? "border-zinc-400 bg-zinc-100 text-zinc-900" : "border-zinc-200 text-zinc-500 hover:border-zinc-400 hover:text-zinc-900"}`}
      >
        {locale.toUpperCase()}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[8rem] overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => { setLocale(l.code as Locale); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-zinc-50 ${locale === l.code ? "font-semibold text-zinc-900" : "text-zinc-600"}`}
            >
              {locale === l.code && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-900" />
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

export function SiteHeader() {
  const { user, loading, hint } = useAuthUser();
  const { locale, t, setLocale } = useLocale();
  const session = useWorkoutSessionContext();

  const showLoggedIn = user != null || (loading && hint);

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
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-6">
        <Link href="/" className="text-lg font-semibold text-zinc-900">
          RunRace
        </Link>
        <div className="flex items-center gap-2 text-sm">
          <LanguagePicker locale={locale} setLocale={setLocale} />
          {showLoggedIn ? (
            <button
              type="button"
              onClick={handleLogout}
              className="text-zinc-600 hover:text-zinc-900 hover:underline"
            >
              {t.header_logout}
            </button>
          ) : loading && hint ? (
            <Skeleton className="h-4 w-12" />
          ) : (
            <a
              href="/login"
              className="text-zinc-600 hover:text-zinc-900 hover:underline"
            >
              {t.header_login}
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
