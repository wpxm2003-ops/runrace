"use client";

import { useAuthUser } from "@/lib/useAuthUser";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

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
  friends: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 19c0-3 2.7-5 6-5s6 2 6 5M14 19c0-2.2 1.8-4 4-4" />
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

function buildItems(myHref: string): NavItem[] {
  return [
    {
      id: "home",
      label: "홈",
      href: "/",
      icon: ICONS.home,
      isActive: (p) => p === "/",
    },
    {
      id: "challenges",
      label: "대결",
      href: "/challenges",
      icon: ICONS.challenge,
      isActive: (p) => p === "/challenges" || p.startsWith("/challenges/"),
    },
    {
      id: "friends",
      label: "친구",
      href: "/friends",
      icon: ICONS.friends,
      isActive: (p) => p === "/friends" || p.startsWith("/friends/"),
    },
    {
      id: "workout",
      label: "운동",
      href: "/workout",
      icon: ICONS.fitness,
      isActive: (p) => p === "/workout",
    },
    {
      id: "my",
      label: "내정보",
      href: myHref,
      icon: ICONS.my,
      isActive: (p) => p === "/login" || p === "/my",
    },
  ];
}

export function BottomNav() {
  const pathname = usePathname() ?? "/";
  const { user } = useAuthUser();
  const myHref = user ? "/my" : "/login";
  const items = buildItems(myHref);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)]"
      aria-label="주요 메뉴"
    >
      <div className="mx-auto flex h-16 max-w-2xl items-stretch justify-around px-2">
        {items.map((item) => {
          const active = item.isActive(pathname);
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
