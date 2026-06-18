"use client";

import Link from "next/link";
import { PageLayout } from "@/app/_components/PageLayout";
import { useLocale } from "@/lib/i18n";

export default function Home() {
  const { t } = useLocale();

  return (
    <PageLayout>
      <p className="text-zinc-600">{t.home_tagline}</p>
      {/* 카드는 한 줄에 하나씩(풀폭) 세로로 쌓는다 */}
      <div className="mt-6 grid gap-3">
        <Link href="/workout/indoor" className="rounded-2xl bg-white p-5 shadow-sm hover:bg-zinc-50">
          <div className="text-base font-semibold">{t.indoor_title}</div>
          <div className="mt-1 text-sm text-zinc-600">{t.indoor_subtitle}</div>
        </Link>
        <Link href="/guides" className="rounded-2xl bg-white p-5 shadow-sm hover:bg-zinc-50">
          <div className="text-base font-semibold">{t.guide_list_title}</div>
          <div className="mt-1 text-sm text-zinc-600">{t.home_guide_card_desc}</div>
        </Link>
      </div>
    </PageLayout>
  );
}
