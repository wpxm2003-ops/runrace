"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { useLocale } from "@/lib/i18n";
import { GUIDES } from "@/lib/guides";
import { nativeNavigate } from "@/lib/nativeNav";

export default function GuidesPage() {
  const { t } = useLocale();

  return (
    <PageLayout title={t.guide_list_title}>
      <div className="flex flex-col gap-3">
        {GUIDES.map((g) => (
          <button
            key={g.slug}
            type="button"
            onClick={() => nativeNavigate(g.href)}
            className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-left hover:bg-zinc-50"
          >
            <div className="min-w-0">
              <div className="text-base font-semibold">{g.title(t)}</div>
              <div className="mt-0.5 text-xs text-zinc-500">{g.desc(t)}</div>
            </div>
            <span aria-hidden className="shrink-0 text-zinc-400">
              ›
            </span>
          </button>
        ))}
      </div>
    </PageLayout>
  );
}
