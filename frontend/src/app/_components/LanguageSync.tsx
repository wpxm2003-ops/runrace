"use client";

import { useEffect, useRef } from "react";
import { useMe } from "@/lib/api";
import { updateLanguage } from "@/lib/api/auth";
import { useLocale } from "@/lib/i18n";
import { shouldSyncLocaleToServer } from "@/lib/i18n/localeSource";
import { useAuthUser } from "@/lib/useAuthUser";

/**
 * 로그인 사용자의 주력 언어(users.lang_cd)를 현재 UI 언어와 동기화한다.
 * 서버가 푸시 알림을 수신자 언어로 보낼 때 이 값을 사용한다. best-effort.
 */
export function LanguageSync() {
  const { user } = useAuthUser();
  const { locale, localeSource } = useLocale();
  // 전역 mutate는 커스텀 provider 캐시에 닿지 않으므로, 훅에 바인딩된 mutate로 갱신한다.
  const { data: me, mutate: mutateMe } = useMe(user);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (!user || !me) return;
    if (!shouldSyncLocaleToServer(localeSource)) return;
    if (me.langCd === locale) return;
    if (syncingRef.current) return;

    syncingRef.current = true;
    updateLanguage(user, locale)
      .then((updated) => {
        void mutateMe(updated, { revalidate: false });
      })
      .catch(() => {
        // 실패 시 다음 effect에서 재시도
      })
      .finally(() => {
        syncingRef.current = false;
      });
  }, [user, me, locale, localeSource, mutateMe]);

  return null;
}
