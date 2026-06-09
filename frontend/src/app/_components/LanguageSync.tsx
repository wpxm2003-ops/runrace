"use client";

import { useEffect, useRef } from "react";
import { useAuthUser } from "@/lib/useAuthUser";
import { useLocale } from "@/lib/i18n";
import { updateLanguage } from "@/lib/api/auth";

/**
 * 로그인 사용자의 주력 언어(app_user.lang_cd)를 현재 UI 언어와 동기화한다.
 * 서버가 푸시 알림을 수신자 언어로 보낼 때 이 값을 사용한다. best-effort.
 */
export function LanguageSync() {
  const { user } = useAuthUser();
  const { locale } = useLocale();
  const sentRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      sentRef.current = null;
      return;
    }
    if (sentRef.current === locale) return;
    sentRef.current = locale;
    updateLanguage(user, locale).catch(() => {
      // 실패하면 다음 변경에서 다시 시도되도록 마커를 해제한다.
      sentRef.current = null;
    });
  }, [user, locale]);

  return null;
}
