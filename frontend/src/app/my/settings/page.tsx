"use client";

import type { User } from "firebase/auth";
import { toast } from "sonner";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { PageLayout } from "@/app/_components/PageLayout";
import { Card } from "@/app/_components/ui/Card";
import { pageLoading } from "@/app/_components/pageLoading";
import { UnitToggle } from "@/app/_components/ui/UnitToggle";
import { NicknameEditor } from "@/app/my/_components/NicknameEditor";
import { NotificationToggle } from "@/app/my/_components/NotificationToggle";
import { useMe } from "@/lib/api";
import { deleteAccount } from "@/lib/api/auth";
import { logout } from "@/lib/auth";
import { useLocale } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useUnit } from "@/lib/UnitContext";
import { useWorkoutSessionContext } from "@/lib/WorkoutSessionProvider";

function MySettingsContent({ user }: { user: User }) {
  const { t } = useLocale();
  const { unit, setUnit } = useUnit();
  const { data: me, isLoading: meLoading } = useMe(user);
  const confirm = useConfirm();
  const session = useWorkoutSessionContext();

  return (
    <>
      <Card>
        <NicknameEditor user={user} nickname={me?.nickname} loading={meLoading} className="" />
      </Card>

      <Card className="mt-4">
        <div className="text-sm text-zinc-500">{t.my_unit_label}</div>
        <div className="mt-2">
          <UnitToggle
            unit={unit}
            onChange={setUnit}
            labels={{ km: t.unit_km, mi: t.unit_mi }}
          />
        </div>
        <p className="mt-2 whitespace-pre-line text-xs text-zinc-400">{t.my_unit_pace_hint}</p>
      </Card>

      <NotificationToggle user={user} />

      <div className="mt-6 overflow-hidden rounded-card border border-line bg-panel shadow-card">
        <a
          href="/privacy"
          className="flex min-h-12 items-center justify-between px-4 text-sm font-medium text-ink transition-colors hover:bg-panel-muted"
        >
          {t.privacy_title}
          <span className="text-lg text-zinc-300" aria-hidden="true">›</span>
        </a>
        <button
          type="button"
          onClick={async () => {
            if (session.status !== "idle") {
              toast.error(t.account_delete_blocked_workout_active);
              return;
            }
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
          className="min-h-12 w-full border-t border-line px-4 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
        >
          {t.my_delete_account}
        </button>
      </div>
    </>
  );
}

export default function MySettingsPage() {
  const { user, loading } = useRequireAuth("/my/settings");
  const { t } = useLocale();

  if (loading || !user) {
    return pageLoading(t.my_settings_title);
  }

  return (
    <PageLayout title={t.my_settings_title} className="pb-10">
      <MySettingsContent user={user} />
    </PageLayout>
  );
}
