"use client";

import type { User } from "firebase/auth";
import { NavRowButton } from "@/app/_components/NavRowButton";
import { PageLayout } from "@/app/_components/PageLayout";
import { Card } from "@/app/_components/ui/Card";
import { pageLoading } from "@/app/_components/pageLoading";
import { UnitToggle } from "@/app/_components/ui/UnitToggle";
import { NicknameEditor } from "@/app/my/_components/NicknameEditor";
import { NotificationToggle } from "@/app/my/_components/NotificationToggle";
import { useMe } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import { nativeNavigate } from "@/lib/nativeNav";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useUnit } from "@/lib/UnitContext";

function MySettingsContent({ user }: { user: User }) {
  const { t } = useLocale();
  const { unit, setUnit } = useUnit();
  const { data: me, isLoading: meLoading } = useMe(user);

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

      <NavRowButton title={t.shoe_manage} onClick={() => nativeNavigate("/shoes")} className="mt-4" />
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
    <PageLayout title={t.my_settings_title}>
      <MySettingsContent user={user} />
    </PageLayout>
  );
}
