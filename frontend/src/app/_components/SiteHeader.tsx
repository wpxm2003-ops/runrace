"use client";

import { Skeleton } from "@/app/_components/ui/Skeleton";
import { logout } from "@/lib/auth";
import { useAuthUser } from "@/lib/useAuthUser";
import { useLocale } from "@/lib/i18n";

export function SiteHeader() {
  const { user, loading } = useAuthUser();
  const { locale, t, toggle } = useLocale();

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-6">
        <a href="/" className="text-lg font-semibold text-zinc-900">
          RunRace
        </a>
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={toggle}
            aria-label="언어 변경 / Change language"
            className="rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-500 hover:border-zinc-400 hover:text-zinc-900"
          >
            {locale === "ko" ? "EN" : "KO"}
          </button>
          {loading ? (
            <Skeleton className="h-4 w-12" />
          ) : user ? (
            <button
              type="button"
              onClick={() => logout()}
              className="text-zinc-600 hover:text-zinc-900 hover:underline"
            >
              {t.header_logout}
            </button>
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
