"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { Card } from "@/app/_components/ui/Card";
import { ShareButton } from "@/app/_components/ShareButton";
import { getAppUrl } from "@/lib/appUrl";
import { useLocale } from "@/lib/i18n";

export default function AppGuidePage() {
  const { t } = useLocale();

  const sections = [
    { h: t.guide_app_s1_h, b: t.guide_app_s1_b },
    { h: t.guide_app_s2_h, b: t.guide_app_s2_b },
    { h: t.guide_app_s3_h, b: t.guide_app_s3_b },
    { h: t.guide_app_s4_h, b: t.guide_app_s4_b },
    { h: t.guide_app_s5_h, b: t.guide_app_s5_b },
  ];

  async function onShare() {
    const { shareLink } = await import("@/lib/shareCard");
    return shareLink(`${getAppUrl()}/guides/app`, t.guide_app_title);
  }

  return (
    <PageLayout title={t.guide_app_title} actions={<ShareButton onShare={onShare} />}>
      <Card>
        <p className="text-sm leading-relaxed text-zinc-700">{t.guide_app_intro}</p>
      </Card>

      {sections.map((s, i) => (
        <Card key={i} className="mt-4">
          <div className="text-base font-semibold">{s.h}</div>
          <p className="mt-2 text-sm leading-relaxed text-zinc-700">{s.b}</p>
        </Card>
      ))}

      <p className="mt-6 text-center text-sm font-medium text-zinc-700">{t.guide_app_outro}</p>
    </PageLayout>
  );
}
