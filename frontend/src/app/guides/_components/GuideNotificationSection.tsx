"use client";

import type { ReactNode } from "react";
import { Card } from "@/app/_components/ui/Card";
import { EnableNotificationsButton } from "@/app/guides/_components/EnableNotificationsButton";
import { useLocale } from "@/lib/i18n";

function renderBold(text: string): ReactNode[] {
  return text.split("**").map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-zinc-900">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

/** iPhone 가이드 전용 알림 안내 섹션. */
export function GuideNotificationSection() {
  const { t } = useLocale();

  return (
    <Card className="mt-4">
      <div className="text-base font-semibold">{t.guide_ios_noti_heading}</div>
      <p className="mt-2 text-sm leading-relaxed text-zinc-700">
        {renderBold(t.guide_ios_noti_body)}
      </p>
      <p className="mt-3 text-base font-semibold text-zinc-900">{t.guide_ios_noti_emphasis}</p>
      <p className="mt-2 text-xs leading-relaxed text-zinc-500">{t.guide_noti_late_hint}</p>
      <div className="mt-4">
        <EnableNotificationsButton />
      </div>
    </Card>
  );
}
