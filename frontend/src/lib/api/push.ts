import type { User } from "firebase/auth";
import { apiFetch } from "./client";

export function registerDeviceToken(user: User, fcmToken: string, platform: string): Promise<void> {
  return apiFetch("/api/me/device-tokens", {
    method: "POST",
    user,
    body: { fcmToken, platform },
  });
}

export function fetchNotificationSetting(
  user: User,
): Promise<{ enabled: boolean; hasToken: boolean }> {
  return apiFetch("/api/me/notification-setting", { user });
}

export function setNotificationSetting(user: User, enabled: boolean): Promise<void> {
  return apiFetch("/api/me/notification-setting", {
    method: "PUT",
    user,
    body: { enabled },
  });
}
