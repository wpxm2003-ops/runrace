"use client";

import Link from "next/link";
import { PageLayout } from "@/app/_components/PageLayout";
import { useLocale } from "@/lib/i18n";
import { ToolsCta } from "./ToolsCta";

export default function ToolsIndexContent() {
  const { t } = useLocale();

  return (
    <PageLayout title={t.tools_title}>
      <p className="text-sm text-zinc-600">{t.tools_desc}</p>
      <div className="mt-6 grid gap-3">
        <Link href="/tools/pace-calculator" className="rounded-2xl bg-white p-5 shadow-sm hover:bg-zinc-50">
          <div className="text-base font-semibold">{t.tools_pace_card_title}</div>
          <div className="mt-1 text-sm text-zinc-600">{t.tools_pace_card_desc}</div>
        </Link>
        <Link href="/tools/treadmill-pace" className="rounded-2xl bg-white p-5 shadow-sm hover:bg-zinc-50">
          <div className="text-base font-semibold">{t.tools_tm_card_title}</div>
          <div className="mt-1 text-sm text-zinc-600">{t.tools_tm_card_desc}</div>
        </Link>
      </div>
      <ToolsCta />
    </PageLayout>
  );
}
