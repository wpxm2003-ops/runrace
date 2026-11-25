"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BottomSheet } from "@/app/_components/ui/BottomSheet";
import { Button, PrimaryButton } from "@/app/_components/ui/Button";
import { reportClientError } from "@/lib/api";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import {
  checkNotificationPermission,
  permissionResultLabel,
  requestNotificationPermission,
  requestPushTokenSync,
} from "@/lib/pushPermission";
import {
  canShowPushPrompt,
  isPushPromptReady,
  loadPushPromptRecord,
  markPushPromptAnswered,
  onPushPromptTrigger,
  snoozePushPrompt,
  type PushPromptTrigger,
} from "@/lib/pushPrompt";

/** 참가 토스트·화면 전환이 먼저 끝나도록 잠깐 기다린 뒤 띄운다. */
const SHOW_DELAY_MS = 700;

/**
 * 알림 사전 설명 시트(전역 1개). 레이스 참가·생성, 첫 운동 저장 직후 triggerPushPrompt로 깨어나
 * OS가 물어볼 수 있는 상태이고 "나중에" 유예 중이 아닐 때만 뜬다. "알림 받기"를 눌러야 OS 권한을
 * 요청하고, 허용되면 FcmBootstrap의 기존 경로로 토큰을 등록한다.
 */
export function PushPermissionPrompt() {
  const { t } = useLocale();
  const pathname = usePathname() ?? "/";
  const [pending, setPending] = useState<PushPromptTrigger | null>(null);
  const [shown, setShown] = useState<PushPromptTrigger | null>(null);

  // 먼저 온 순간 하나만 잡는다. 이미 떠 있거나 대기 중이면 뒤에 온 순간은 버린다.
  useEffect(() => onPushPromptTrigger((trigger) => setPending((prev) => prev ?? trigger)), []);

  useEffect(() => {
    if (!pending || shown) return;
    if (!isPushPromptReady(pending, pathname)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void checkNotificationPermission()
        .catch(() => "unsupported" as const)
        .then((permission) => {
          if (cancelled) return;
          setPending(null);
          if (!canShowPushPrompt(permission, loadPushPromptRecord(), Date.now())) return;
          setShown(pending);
          void track("push_prompt_shown", { trigger: pending });
        });
    }, SHOW_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pending, shown, pathname]);

  if (!shown) return null;
  const trigger = shown;

  function onLater(via: "button" | "dismiss") {
    snoozePushPrompt(Date.now());
    void track("push_prompt_later", { trigger, via });
    setShown(null);
  }

  async function onAccept() {
    void track("push_prompt_accepted", { trigger });
    // OS 팝업이 시트 위에 겹치지 않도록 먼저 닫는다.
    setShown(null);
    try {
      const state = await requestNotificationPermission();
      markPushPromptAnswered();
      void track("push_permission_result", {
        result: permissionResultLabel(state),
        source: "prompt",
        trigger,
      });
      if (state === "granted") void requestPushTokenSync();
    } catch (e) {
      // 플러그인 오류로 팝업을 못 띄웠다 — 사용자가 답한 게 아니므로 유예만 걸고 다음 기회에 다시 묻는다.
      snoozePushPrompt(Date.now());
      void reportClientError({
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
        kind: "push_permission_request_failed",
      });
    }
  }

  const points = [t.push_prompt_point_overtake, t.push_prompt_point_ended, t.push_prompt_point_friends];

  return (
    <BottomSheet onClose={() => onLater("dismiss")} zIndexClass="z-[120]">
      <div className="px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-6">
        <div className="text-3xl" aria-hidden="true">🔔</div>
        <h2 className="mt-2 text-lg font-bold tracking-tight text-ink">{t.push_prompt_title}</h2>
        <ul className="mt-3 space-y-2">
          {points.map((point) => (
            <li key={point} className="flex gap-2 text-sm leading-relaxed text-zinc-700">
              <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-zinc-500">{t.push_prompt_footnote}</p>
        <div className="mt-5 flex flex-col gap-2">
          <PrimaryButton className="w-full" onClick={() => void onAccept()}>
            {t.push_prompt_accept}
          </PrimaryButton>
          <Button variant="ghost" className="w-full" onClick={() => onLater("button")}>
            {t.push_prompt_later}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
