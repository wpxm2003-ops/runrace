"use client";

import { trackEvent } from "@/lib/api";
import { useAuthUser } from "@/lib/useAuthUser";
import { useEffect } from "react";

export function AppOpenTracker() {
  const { user } = useAuthUser();

  useEffect(() => {
    if (!user) return;
    trackEvent("app_open", "{}", user).catch(() => {});
  }, [user]);

  return null;
}

