"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/app/_components/ui/Button";
import { track } from "@/lib/analytics";
import { openAppNotificationSettings } from "@/lib/appNotificationSettings";
import { useLocale } from "@/lib/i18n";

export type NotificationSettingsOpener = {
  open: () => Promise<void>;
  opening: boolean;
  showSteps: boolean;
};

/**
 * 이 앱의 OS 알림 설정 화면을 연다. 새 APK에서는 설정 화면이 바로 열리고, 플러그인이 없는
 * 기존 APK에서는 showSteps가 켜져 "설정 > 애플리케이션 > RunRace > 알림" 단계 안내를 보여 준다.
 */
export function useNotificationSettingsOpener(
  /** push_settings_opened 이벤트의 진입 화면 */
  source: "settings" | "guide",
  /** OS 설정 화면이 열렸을 때(복귀 후 결과 측정용) */
  onOpened?: () => void,
): NotificationSettingsOpener {
  const [opening, setOpening] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const openingRef = useRef(false);
  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;

  const open = useCallback(async () => {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    try {
      const result = await openAppNotificationSettings();
      void track("push_settings_opened", {
        method: result === "opened" ? "native" : "guide",
        source,
      });
      if (result === "opened") onOpenedRef.current?.();
      else setShowSteps(true);
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  }, [source]);

  return { open, opening, showSteps };
}

/** 알림을 거부해 OS가 더 이상 묻지 않는 사용자용 "휴대폰 설정에서 알림 켜기" 버튼. */
export function NotificationSettingsCta({
  opener,
  className = "",
}: {
  opener: NotificationSettingsOpener;
  className?: string;
}) {
  const { t } = useLocale();
  return (
    <div className={className}>
      <Button
        variant="secondary"
        className="w-full"
        disabled={opener.opening}
        onClick={() => void opener.open()}
      >
        {t.push_settings_open_btn}
      </Button>
      {opener.showSteps ? (
        <p role="status" className="mt-2 text-xs leading-relaxed text-zinc-600">
          {t.push_settings_steps}
        </p>
      ) : null}
    </div>
  );
}
