"use client";

import { logout } from "@/lib/auth";
import { useAuthUser } from "@/lib/useAuthUser";

export function SiteHeader() {
  const { user, loading } = useAuthUser();

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-6">
        <a href="/" className="text-lg font-semibold text-zinc-900">
          RunRace
        </a>
        <div className="text-sm">
          {!loading && user ? (
            <button
              type="button"
              onClick={() => logout()}
              className="text-zinc-600 hover:text-zinc-900 hover:underline"
            >
              로그아웃
            </button>
          ) : !loading ? (
            <a
              href="/login"
              className="text-zinc-600 hover:text-zinc-900 hover:underline"
            >
              로그인
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );
}
