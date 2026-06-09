"use client";

import { useNavProgress } from "@/app/_components/NavProgressProvider";
import { useAuthUser } from "@/lib/useAuthUser";
import { useLocale } from "@/lib/i18n";
import { usePathname } from "next/navigation";
import { useMemo, type ReactNode } from "react";

type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: ReactNode;
  isActive: (pathname: string) => boolean;
};

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-6 w-6 items-center justify-center [&>svg]:h-6 [&>svg]:w-6">
      {children}
    </span>
  );
}

const ICONS = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  ),
  challenge: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 4h12v4H6V4Zm0 6h12v10H6V10Zm3 3h6v4H9v-4Z" />
    </svg>
  ),
  records: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  ),
  fitness: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4l-2 9M12 11l2 9M8 12l-2 2M16 12l2 2" />
    </svg>
  ),
  my: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
    </svg>
  ),
};

export function BottomNav() {
  const pathname = usePathname() ?? "/";
  const { pendingHref } = useNavProgress();
  const { user, loading } = useAuthUser();
  const { t } = useLocale();
  // 인증 복원 중에는 /my 로 보내 useRequireAuth 가 로딩을 기다리게 한다 (조기 /login 방지)
  const myHref = user || loading ? "/my" : "/login";
  const activePath = pendingHref?.split("?")[0].split("#")[0] ?? pathname;

  const items: NavItem[] = useMemo(
    () => [
      {
        id: "home",
        label: t.nav_home,
        href: "/",
        icon: ICONS.home,
        isActive: (p) => p === "/",
      },
      {
        id: "challenges",
        label: t.nav_races,
        href: "/challenges",
        icon: ICONS.challenge,
        isActive: (p) => p === "/challenges" || p.startsWith("/challenges/"),
      },
      {
        id: "workout",
        label: t.nav_workout,
        href: "/workout",
        icon: ICONS.fitness,
        isActive: (p) => p === "/workout",
      },
      {
        id: "records",
        label: t.nav_records,
        href: "/records",
        icon: ICONS.records,
        isActive: (p) => p === "/records",
      },
      {
        id: "my",
        label: t.nav_profile,
        href: myHref,
        icon: ICONS.my,
        isActive: (p) => p === "/login" || p === "/my",
      },
    ],
    [t, myHref],
  );

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)]"
      aria-label={t.nav_main_menu}
    >
      <div className="mx-auto flex h-16 max-w-2xl items-stretch justify-around px-2">
        {items.map((item) => {
          const active = item.isActive(activePath);
          return (
            <a
              key={item.id}
              href={item.href}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] ${
                active ? "font-semibold text-zinc-900" : "text-zinc-500"
              }`}
            >
              <NavIcon>{item.icon}</NavIcon>
              <span>{item.label}</span>
              {active ? (
                <span className="mt-0.5 h-0.5 w-5 rounded-full bg-zinc-900" />
              ) : (
                <span className="mt-0.5 h-0.5 w-5" />
              )}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
