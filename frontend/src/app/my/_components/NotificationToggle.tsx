"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { Card } from "@/app/_components/ui/Card";
import { useAlert } from "@/app/_components/ConfirmProvider";
import { useNotificationSetting, setNotificationSetting } from "@/lib/api";
import { track } from "@/lib/analytics";
import { isIosWeb } from "@/lib/nativeNav";
import { useLocale } from "@/lib/i18n";
import { toast } from "sonner";

/** 푸시 알림 수신 토글 — users.push_enabled를 갱신한다. */
export function NotificationToggle({ user }: { user: User }) {
  const { t } = useLocale();
  const alert = useAlert();
  const { data, isLoading, mutate } = useNotificationSetting(user);
  const [saving, setSaving] = useState(false);
  // 디바이스 토큰이 없으면(앱 푸시 미동의) 토글 불가 — 항상 OFF로 보이게 한다.
  const hasToken = data?.hasToken ?? false;
  const enabled = hasToken ? (data?.enabled ?? false) : false;

  async function onToggle() {
    if (isLoading || saving) return;
    // 토큰이 없으면 상태를 바꾸지 않고 안내만 띄운다(클릭해도 OFF 유지).
    // iOS 웹/PWA는 푸시 미지원(PWA 알림 제거됨) — 재설치 안내 대신 준비 중 안내를 띄운다.
    if (!hasToken) {
      void alert({
        title: t.my_notification_label,
        message: isIosWeb() ? t.push_ios_unavailable_message : t.push_no_token_message,
        confirmLabel: t.confirm,
      });
      return;
    }
    const next = !enabled;
    setSaving(true);
    void mutate({ enabled: next, hasToken }, { revalidate: false }); // 낙관적 업데이트
    try {
      await setNotificationSetting(user, next);
      void track("push_toggle", { enabled: next });
    } catch {
      void mutate(); // 실패 시 서버 값으로 되돌림
      toast.error(t.error_occurred);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-zinc-900">{t.my_notification_label}</div>
          <p className="mt-0.5 text-xs text-zinc-500">{t.my_notification_desc}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t.my_notification_label}
          disabled={isLoading || saving}
          onClick={onToggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            enabled ? "bg-zinc-900" : "bg-zinc-300"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              enabled ? "left-[1.375rem]" : "left-0.5"
            }`}
          />
        </button>
      </div>
    </Card>
  );
}
