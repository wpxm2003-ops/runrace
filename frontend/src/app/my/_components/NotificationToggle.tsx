"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { Card } from "@/app/_components/ui/Card";
import { useAlert } from "@/app/_components/ConfirmProvider";
import {
  NotificationSettingsCta,
  useNotificationSettingsOpener,
} from "@/app/_components/NotificationSettingsCta";
import { useNotificationSetting, setNotificationSetting } from "@/lib/api";
import { track } from "@/lib/analytics";
import { isIosWeb, isNativeApp } from "@/lib/nativeNav";
import { useLocale } from "@/lib/i18n";
import {
  onPushTokenRegistered,
  permissionResultLabel,
  requestNotificationPermission,
  requestPushTokenSync,
} from "@/lib/pushPermission";
import { markPushPromptAnswered } from "@/lib/pushPrompt";
import { useNotificationPermission } from "@/lib/useNotificationPermission";
import { toast } from "sonner";

/**
 * 푸시 알림 수신 토글 — users.push_enabled를 갱신한다.
 * 이 기기 토큰이 아직 없으면(알림 권한 미허용) 토글이 권한 요청을 대신한다:
 * OS가 물어볼 수 있으면 바로 권한 팝업을 띄우고, OS가 더 이상 묻지 않으면 휴대폰 설정으로 안내한다.
 */
export function NotificationToggle({ user }: { user: User }) {
  const { t } = useLocale();
  const alert = useAlert();
  const { data, isLoading, mutate } = useNotificationSetting(user);
  const { permission, setPermission, refresh } = useNotificationPermission();
  const [saving, setSaving] = useState(false);
  const settingsOpenedRef = useRef(false);
  const settingsOpener = useNotificationSettingsOpener("settings", () => {
    settingsOpenedRef.current = true;
  });
  // 디바이스 토큰이 없으면(앱 푸시 미동의) 항상 OFF로 보이게 한다.
  const hasToken = data?.hasToken ?? false;
  const enabled = hasToken ? (data?.enabled ?? false) : false;
  // OS가 더 이상 묻지 않는 상태 — 휴대폰 설정에서만 켤 수 있다.
  const blockedByOs = permission === "denied";

  // 토큰이 등록되면(권한 허용 직후, 휴대폰 설정에서 켜고 복귀) 서버 상태를 다시 읽는다.
  useEffect(() => onPushTokenRegistered(() => void mutate()), [mutate]);

  // 휴대폰 설정에서 켜고 돌아왔다 — 결과를 남기고 토큰 등록을 바로 요청한다
  // (FcmBootstrap의 복귀 동기화와 겹쳐도 등록은 한 번만 돈다).
  useEffect(() => {
    if (!settingsOpenedRef.current || permission !== "granted") return;
    settingsOpenedRef.current = false;
    void track("push_permission_result", { result: "granted", source: "os_settings" });
    void requestPushTokenSync();
  }, [permission]);

  async function enableWithoutToken() {
    // 웹은 앱 푸시가 없다 — iOS는 준비 중 안내, 그 외는 Android 앱 안내.
    if (!isNativeApp()) {
      void alert({
        title: t.my_notification_label,
        message: isIosWeb() ? t.push_ios_unavailable_message : t.push_app_only_message,
        confirmLabel: t.confirm,
      });
      return;
    }
    setSaving(true);
    try {
      let state = await refresh();
      if (state === "denied") {
        await settingsOpener.open();
        return;
      }
      if (state === "prompt") {
        state = await requestNotificationPermission();
        setPermission(state);
        markPushPromptAnswered();
        void track("push_permission_result", {
          result: permissionResultLabel(state),
          source: "settings",
        });
      }
      // 거부(denied)면 아래 "휴대폰 설정에서 알림 켜기" 버튼이 보이고, 한 번만 거부(prompt)면 OFF 유지.
      if (state !== "granted") return;
      const registered = await requestPushTokenSync();
      await mutate();
      if (!registered) toast.error(t.push_token_sync_failed);
    } catch {
      toast.error(t.error_occurred);
    } finally {
      setSaving(false);
    }
  }

  async function onToggle() {
    if (isLoading || saving) return;
    if (!hasToken) {
      await enableWithoutToken();
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
            enabled ? "bg-brand" : "bg-zinc-300"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              enabled ? "left-[1.375rem]" : "left-0.5"
            }`}
          />
        </button>
      </div>
      {blockedByOs ? (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-xs text-zinc-500">{t.push_settings_denied_desc}</p>
          <NotificationSettingsCta opener={settingsOpener} className="mt-2" />
        </div>
      ) : null}
    </Card>
  );
}
