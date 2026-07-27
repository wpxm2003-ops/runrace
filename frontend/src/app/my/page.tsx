"use client";

import type { User } from "firebase/auth";
import { PageLayout } from "@/app/_components/PageLayout";
import { Card } from "@/app/_components/ui/Card";
import { LoadingCard } from "@/app/_components/ui/LoadingCard";
import { MyRacesSection } from "@/app/my/_components/MyRacesSection";
import { MySettingsGear } from "@/app/my/_components/MySettingsGear";
import { WorkoutSummarySection } from "@/app/my/_components/WorkoutSummarySection";
import { useMe } from "@/lib/api";
import { deleteAccount } from "@/lib/api/auth";
import { logout } from "@/lib/auth";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";

/** 인증 확정 후에만 마운트 → SWR 훅이 로딩 단계에서 중복 기동되지 않음 */
function MyPageContent({ user }: { user: User }) {
  const { t } = useLocale();
  const { data: me, isLoading: meLoading } = useMe(user);
  const confirm = useConfirm();

  return (
    <PageLayout title={t.my_title} titleSuffix={<MySettingsGear />}>
      <Card>
        <div className="text-sm text-zinc-500">{t.my_account_label}</div>
        <div className="mt-1 text-sm text-zinc-600">{user.email ?? ""}</div>

        <div className="mt-4">
          <div className="text-sm text-zinc-500">{t.my_nickname_label}</div>
          <div className="mt-1 text-base font-medium">
            {meLoading ? "..." : (me?.nickname ?? t.no_name)}
          </div>
        </div>
      </Card>

      <WorkoutSummarySection user={user} />

      <MyRacesSection user={user} />

      <button
        type="button"
        onClick={async () => {
          const ok = await confirm({
            title: t.my_delete_account_title,
            message: t.my_delete_account_message,
            confirmLabel: t.my_delete_account_confirm,
            cancelLabel: t.cancel,
            destructive: true,
          });
          if (!ok) return;
          await deleteAccount(user);
          await logout();
        }}
        className="mt-4 h-11 w-full rounded-xl text-sm text-red-600 hover:bg-red-50"
      >
        {t.my_delete_account}
      </button>

      <div className="mt-6 pb-2 text-center">
        <a href="/privacy" className="text-xs text-zinc-400 underline">
          {t.privacy_title}
        </a>
      </div>
    </PageLayout>
  );
}

export default function MyPage() {
  const { user, loading } = useRequireAuth("/my");
  const { t } = useLocale();

  if (loading || !user) {
    return (
      <PageLayout title={t.my_title}>
        <LoadingCard />
      </PageLayout>
    );
  }

  return <MyPageContent user={user} />;
}
