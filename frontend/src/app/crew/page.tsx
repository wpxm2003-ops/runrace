"use client";

import type { User } from "firebase/auth";
import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { LoadingCard } from "@/app/_components/ui/LoadingCard";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import {
  useMyCrew,
  useLeaderJoinRequests,
  invalidateMyCrew,
  toDisplayError,
} from "@/lib/api";
import { useAuthUser } from "@/lib/useAuthUser";
import { useLocale } from "@/lib/i18n";
import { CrewSettingsGear } from "./_components/CrewSettingsGear";
import { CrewOnboarding } from "./_components/CrewOnboarding";
import { CrewHome } from "./_components/CrewHome";

function CrewContent({ user }: { user: User | null }) {
  const { data, isLoading, error, mutate } = useMyCrew(user);

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
  if (!user) {
    return <CrewOnboarding user={null} onDone={() => {}} />;
  }
  if (!data) return null;

  if (!data.crew) {
    return (
      <CrewOnboarding
        user={user}
        onDone={() => {
          void mutate();
          invalidateMyCrew(user.uid);
        }}
      />
    );
  }
  return <CrewHome crew={data.crew} user={user} />;
}

export default function CrewPage() {
  const { user, loading } = useAuthUser();
  const { t } = useLocale();
  // 제목 옆 톱니바퀴 노출 판단용 — CrewContent와 같은 SWR 키라 중복 요청 없음.
  const { data } = useMyCrew(user ?? null);
  const isLeader = Boolean(data?.crew?.isLeader);
  const { data: joinRequests } = useLeaderJoinRequests(user ?? null, isLeader);
  const pendingJoinRequestCount = isLeader ? (joinRequests?.length ?? 0) : 0;

  if (loading) {
    return (
      <PageLayout title={t.crew_title}>
        <LoadingCard />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={t.crew_title}
      titleSuffix={data?.crew ? <CrewSettingsGear pendingCount={pendingJoinRequestCount} /> : undefined}
    >
      <CrewContent user={user ?? null} />
    </PageLayout>
  );
}
