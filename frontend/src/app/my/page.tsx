"use client";

import type { User } from "firebase/auth";
import { PageLayout } from "@/app/_components/PageLayout";
import { pageLoading } from "@/app/_components/pageLoading";
import { MyRacesSection } from "@/app/my/_components/MyRacesSection";
import { MySettingsGear } from "@/app/my/_components/MySettingsGear";
import { WorkoutSummarySection } from "@/app/my/_components/WorkoutSummarySection";
import { useMe } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import { nativeNavigate } from "@/lib/nativeNav";
import { useRequireAuth } from "@/lib/useRequireAuth";

function ProfileCard({
  email,
  nickname,
  loading,
  shoeLabel,
  rivalLabel,
  onOpenShoes,
  onOpenRivals,
}: {
  email: string;
  nickname: string;
  loading: boolean;
  shoeLabel: string;
  rivalLabel: string;
  onOpenShoes: () => void;
  onOpenRivals: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
      <div className="p-4">
        <h2 className="truncate text-lg font-black tracking-[-0.03em] text-ink">
          {loading ? "..." : nickname}
        </h2>
        <p className="mt-1 truncate text-xs text-muted">{email}</p>
      </div>
      <button
        type="button"
        onClick={onOpenShoes}
        className="flex min-h-12 w-full items-center justify-between border-t border-line px-4 text-left text-sm font-bold text-ink transition-colors hover:bg-panel-muted"
      >
        <span className="flex items-center gap-2.5">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5 text-brand">
            <path d="M4 15c4.5.5 6.5-1 8-5l2 2c1.5 1.5 3.2 2.3 6 2.5V19H4v-4Z" />
            <path d="M12 10 9 7M15 13l2-2" />
          </svg>
          {shoeLabel}
        </span>
        <span className="text-lg text-zinc-300" aria-hidden="true">›</span>
      </button>
      <button
        type="button"
        onClick={onOpenRivals}
        className="flex min-h-12 w-full items-center justify-between border-t border-line px-4 text-left text-sm font-bold text-ink transition-colors hover:bg-panel-muted"
      >
        <span className="flex items-center gap-2.5">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5 text-brand">
            <circle cx="9" cy="8" r="3" />
            <circle cx="17" cy="9" r="2.5" />
            <path d="M3.5 20c0-3.4 2.4-6 5.5-6s5.5 2.6 5.5 6M14 15c3.4-.8 6.5 1.2 6.5 5" />
          </svg>
          {rivalLabel}
        </span>
        <span className="text-lg text-zinc-300" aria-hidden="true">›</span>
      </button>
    </section>
  );
}

function MyPageContent({ user }: { user: User }) {
  const { t } = useLocale();
  const { data: me, isLoading: meLoading } = useMe(user);
  const nickname = me?.nickname ?? t.no_name;

  return (
    <PageLayout title={t.my_title} actions={<MySettingsGear />} className="pb-10">
      <ProfileCard
        email={user.email ?? ""}
        nickname={nickname}
        loading={meLoading}
        shoeLabel={t.shoe_manage}
        rivalLabel={t.rival_manage}
        onOpenShoes={() => nativeNavigate("/shoes")}
        onOpenRivals={() => nativeNavigate("/rivals")}
      />

      <WorkoutSummarySection user={user} />

      <MyRacesSection user={user} />

    </PageLayout>
  );
}

export default function MyPage() {
  const { user, loading } = useRequireAuth("/my");
  const { t } = useLocale();

  if (loading || !user) {
    return pageLoading(t.my_title);
  }

  return <MyPageContent user={user} />;
}
