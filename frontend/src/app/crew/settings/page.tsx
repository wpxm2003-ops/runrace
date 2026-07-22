"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { LoadingCard } from "@/app/_components/ui/LoadingCard";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import {
  disbandCrew,
  leaveCrew,
  useMyCrew,
  invalidateMyCrew,
  toDisplayError,
  reportAndDisplay,
} from "@/lib/api";
import { EditSection } from "../_components/EditSection";
import { ProfileSection } from "../_components/ProfileSection";
import { MemberSection } from "../_components/MemberSection";
import { JoinRequestInbox } from "../_components/JoinRequestInbox";
import { handleAuthFailure } from "@/lib/auth";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { nativeNavigate } from "@/lib/nativeNav";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { toast } from "sonner";

function SettingsContent({ user }: { user: User }) {
  const { t } = useLocale();
  const confirm = useConfirm();
  const { data, isLoading, error, mutate } = useMyCrew(user);
  const [busy, setBusy] = useState(false);

  // 미소속(해체 직후·직접 URL 진입 등) — 크루 홈으로 되돌린다.
  const noCrew = !!data && !data.crew;
  useEffect(() => {
    if (noCrew) nativeNavigate("/crew", { replace: true });
  }, [noCrew]);

  if (error) {
    return (
      <Card>
        <Alert>{toDisplayError(error)}</Alert>
      </Card>
    );
  }
  if (isLoading && !data) {
    return (
      <Card>
        <SkeletonLines count={3} />
      </Card>
    );
  }
  if (!data?.crew) return null;
  const crew = data.crew;

  function refresh() {
    void mutate();
    invalidateMyCrew(user.uid);
  }

  async function onDisband() {
    const ok = await confirm({
      title: t.crew_disband_confirm_title,
      message: t.crew_disband_confirm_message,
      confirmLabel: t.crew_disband_btn,
      cancelLabel: t.cancel,
      destructive: true,
    });
    if (!ok || busy) return;
    setBusy(true);
    try {
      await disbandCrew(crew.id, user);
      toast.success(t.toast_crew_disbanded);
      refresh();
      nativeNavigate("/crew", { replace: true });
    } catch (e) {
      if (!handleAuthFailure(e, "/crew/settings")) toast.error(reportAndDisplay(e) ?? t.error_occurred);
      setBusy(false);
    }
  }

  async function onLeave() {
    const ok = await confirm({
      title: t.crew_leave_confirm_title,
      message: t.crew_leave_confirm_message,
      confirmLabel: t.crew_leave_btn,
      cancelLabel: t.cancel,
      destructive: true,
    });
    if (!ok || busy) return;
    setBusy(true);
    try {
      await leaveCrew(user);
      toast.success(t.toast_crew_left);
      refresh();
      nativeNavigate("/crew", { replace: true });
    } catch (e) {
      if (!handleAuthFailure(e, "/crew/settings")) toast.error(reportAndDisplay(e) ?? t.error_occurred);
      setBusy(false);
    }
  }

  return (
    <>
      {crew.isLeader ? (
        <>
          <EditSection crew={crew} user={user} onSaved={refresh} />
          <ProfileSection crew={crew} user={user} onSaved={refresh} />
          <MemberSection crew={crew} user={user} onChanged={refresh} />
          <JoinRequestInbox user={user} onChanged={refresh} />
          <button
            type="button"
            disabled={busy}
            onClick={onDisband}
            className="mt-4 h-11 w-full rounded-xl text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {t.crew_disband_btn}
          </button>
        </>
      ) : (
        <>
          <Card>
            <div className="text-lg font-bold text-zinc-900">{crew.name}</div>
            <div className="mt-0.5 text-xs text-zinc-500">
              {t.crew_member_count(crew.members.length, crew.maxMembers)}
            </div>
          </Card>
          <button
            type="button"
            disabled={busy}
            onClick={onLeave}
            className="mt-4 h-11 w-full rounded-xl text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {t.crew_leave_btn}
          </button>
        </>
      )}
    </>
  );
}

export default function CrewSettingsPage() {
  const { user, loading } = useRequireAuth("/crew/settings");
  const { t } = useLocale();

  if (loading || !user) {
    return (
      <PageLayout title={t.crew_settings_title}>
        <LoadingCard />
      </PageLayout>
    );
  }

  return (
    <PageLayout title={t.crew_settings_title}>
      <SettingsContent user={user} />
    </PageLayout>
  );
}
