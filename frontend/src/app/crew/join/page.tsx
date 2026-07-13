"use client";

import { useMemo, useState } from "react";
import { PageLayout } from "@/app/_components/PageLayout";
import { Card } from "@/app/_components/ui/Card";
import { LoadingCard } from "@/app/_components/ui/LoadingCard";
import {
  joinCrew,
  useCrewJoinInfo,
  invalidateMyCrew,
  toDisplayError,
  reportClientError,
} from "@/lib/api";
import { handleAuthFailure, redirectToLogin } from "@/lib/auth";
import { nativeNavigate } from "@/lib/nativeNav";
import { useAuthUser } from "@/lib/useAuthUser";
import { useLocale } from "@/lib/i18n";
import { toast } from "sonner";

/**
 * 크루 초대 랜딩 — /crew/join?code=ABC234
 * 정적 export 환경이라 동적 세그먼트 대신 쿼리 파라미터를 쓴다(별도 서버 라우팅 불필요).
 * 비로그인도 크루 이름·인원을 보여주고, 로그인 후 이 URL로 복귀해 바로 가입한다.
 */
export default function CrewJoinPage() {
  const { t } = useLocale();
  const { user, loading: authLoading } = useAuthUser();
  const [joining, setJoining] = useState(false);

  const code = useMemo(() => {
    if (typeof window === "undefined") return null;
    const raw = new URLSearchParams(window.location.search).get("code");
    return raw ? raw.trim().toUpperCase() : null;
  }, []);

  const { data: info, isLoading, error } = useCrewJoinInfo(code, user ?? null);

  async function onJoin() {
    if (!user || !code || joining) return;
    setJoining(true);
    try {
      await joinCrew(code, user);
      invalidateMyCrew(user.uid);
      toast.success(t.toast_crew_joined);
      nativeNavigate("/crew", { replace: true });
    } catch (e) {
      void reportClientError({
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? (e.stack ?? null) : null,
        kind: "action",
      });
      if (!handleAuthFailure(e, `/crew/join?code=${code}`)) {
        const msg = String(e);
        toast.error(
          msg.includes("crew_full")
            ? t.crew_err_full
            : msg.includes("already_in_crew")
              ? t.crew_err_already_in_crew
              : (toDisplayError(e) ?? t.error_occurred),
        );
      }
      setJoining(false);
    }
  }

  // 코드 없음·조회 실패(404 포함) — 안내 후 홈으로.
  if (!code || error) {
    return (
      <PageLayout title={t.crew_title}>
        <Card>
          <p className="py-4 text-center text-sm text-zinc-600">{t.crew_err_not_found}</p>
          <button
            type="button"
            onClick={() => nativeNavigate("/", { replace: true })}
            className="mt-2 h-10 w-full rounded-xl border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            {t.close}
          </button>
        </Card>
      </PageLayout>
    );
  }

  if (isLoading || !info || authLoading) {
    return (
      <PageLayout title={t.crew_title}>
        <LoadingCard />
      </PageLayout>
    );
  }

  const statusNotice =
    info.status === "FULL"
      ? t.crew_join_landing_full
      : info.status === "ALREADY_MEMBER"
        ? t.crew_join_landing_already_this
        : info.status === "IN_OTHER_CREW"
          ? t.crew_join_landing_already_other
          : null;

  return (
    <PageLayout title={t.crew_title}>
      <Card>
        <div className="py-2 text-center">
          <div className="text-lg font-bold text-zinc-900">
            {t.crew_join_landing_heading(info.name)}
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {t.crew_join_landing_members(info.memberCount)}
          </p>
          <p className="mt-0.5 text-xs text-zinc-400">
            {t.crew_member_count(info.memberCount, info.maxMembers)}
          </p>

          {statusNotice ? (
            <p className="mt-4 rounded-xl bg-zinc-50 px-3 py-2.5 text-sm text-zinc-600">
              {statusNotice}
            </p>
          ) : null}

          {info.status === "ALREADY_MEMBER" ? (
            <button
              type="button"
              onClick={() => nativeNavigate("/crew", { replace: true })}
              className="mt-4 h-11 w-full rounded-xl bg-zinc-900 text-sm text-white"
            >
              {t.crew_go_home}
            </button>
          ) : info.status === "JOINABLE" ? (
            user ? (
              <button
                type="button"
                disabled={joining}
                onClick={onJoin}
                className="mt-4 h-11 w-full rounded-xl bg-zinc-900 text-sm text-white disabled:opacity-50"
              >
                {joining ? t.crew_join_busy : t.crew_join_landing_cta}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => redirectToLogin(`/crew/join?code=${code}`)}
                className="mt-4 h-11 w-full rounded-xl bg-zinc-900 text-sm text-white"
              >
                {t.crew_join_landing_login}
              </button>
            )
          ) : null}
        </div>
      </Card>
    </PageLayout>
  );
}
