"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { NavRowButton } from "@/app/_components/NavRowButton";
import { useLocale } from "@/lib/i18n";
import { GUIDES } from "@/lib/guides";
import { nativeNavigate } from "@/lib/nativeNav";

export default function GuidesPage() {
  const { t } = useLocale();

  return (
    <PageLayout title={t.guide_list_title}>
      <div className="flex flex-col gap-3">
        {GUIDES.map((g) => (
          <NavRowButton
            key={g.slug}
            title={g.title(t)}
            subtitle={g.desc(t)}
            onClick={() => nativeNavigate(g.href)}
          />
        ))}
      </div>
    </PageLayout>
  );
}
