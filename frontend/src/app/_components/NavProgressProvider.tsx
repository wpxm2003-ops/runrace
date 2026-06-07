"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type NavProgressContextValue = {
  /** 탭 즉시 반응용 — 이동 중이면 목적지 경로 */
  pendingHref: string | null;
  isNavigating: boolean;
  beginNavigation: (href: string) => void;
};

const NavProgressContext = createContext<NavProgressContextValue | null>(null);

function normalizePath(href: string): string {
  return href.split("?")[0].split("#")[0] || "/";
}

export function NavProgressProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  const beginNavigation = useCallback(
    (href: string) => {
      const target = normalizePath(href);
      if (target === normalizePath(pathname)) return;
      setPendingHref(href);
    },
    [pathname],
  );

  const isNavigating = pendingHref !== null;

  const value = useMemo(
    () => ({ pendingHref, isNavigating, beginNavigation }),
    [pendingHref, isNavigating, beginNavigation],
  );

  return (
    <NavProgressContext.Provider value={value}>
      {isNavigating ? <NavProgressBar /> : null}
      {children}
    </NavProgressContext.Provider>
  );
}

export function useNavProgress(): NavProgressContextValue {
  const ctx = useContext(NavProgressContext);
  if (!ctx) throw new Error("useNavProgress must be used within NavProgressProvider");
  return ctx;
}

function NavProgressBar() {
  return (
    <div
      className="pointer-events-none fixed left-0 right-0 top-14 z-40 h-0.5 overflow-hidden bg-zinc-200/80"
      role="progressbar"
      aria-label="Loading"
    >
      <div className="nav-progress-indeterminate h-full bg-zinc-900" />
    </div>
  );
}
