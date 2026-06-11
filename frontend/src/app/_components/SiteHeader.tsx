"use client";

import Link from "next/link";
import { Skeleton } from "@/app/_components/ui/Skeleton";
import { logout } from "@/lib/auth";
import { useAuthUser } from "@/lib/useAuthUser";
import { LOCALES, type Locale, useLocale } from "@/lib/i18n";

export function SiteHeader() {
  const { user, loading, hint } = useAuthUser();
  const { locale, t, setLocale } = useLocale();

  // 인증 복원 대기 중이라도 이전 로그인 힌트가 있으면 로그아웃 버튼을 미리 보여준다(스켈레톤 깜빡임 방지).
  const showLoggedIn = user != null || (loading && hint);

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-6">
        <Link href="/" className="text-lg font-semibold text-zinc-900">
          RunRace
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            aria-label="Change language"
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-500 hover:border-zinc-400 hover:text-zinc-900"
          >
            {LOCALES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          {showLoggedIn ? (
            <button
              type="button"
              onClick={() => logout()}
              className="text-zinc-600 hover:text-zinc-900 hover:underline"
            >
              {t.header_logout}
            </button>
          ) : loading ? (
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
