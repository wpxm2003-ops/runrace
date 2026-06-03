"use client";

import { apiFetch } from "@/lib/api";
import { useAuthUser } from "@/lib/useAuthUser";
import { useEffect } from "react";

export function AppOpenTracker() {
  const { user } = useAuthUser();

  useEffect(() => {
    if (!user) return;
    apiFetch<void>("/api/analytics/events", {
      method: "POST",
      user,
      body: { name: "app_open", propsJson: "{}" },
    }).catch(() => {});
  }, [user]);

  return null;
}

