"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { useLocale } from "@/lib/i18n";

export default function Home() {
  const { t } = useLocale();

  return (
    <PageLayout title="RunRace">
      <p className="text-zinc-600">{t.home_tagline}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <a href="/workout" className="rounded-2xl bg-white p-5 shadow-sm hover:bg-zinc-50">
          <div className="text-lg font-semibold">{t.home_workout}</div>
          <div className="mt-1 text-sm text-zinc-600">{t.home_workout_desc}</div>
        </a>
        <a href="/challenges" className="rounded-2xl bg-white p-5 shadow-sm hover:bg-zinc-50">
          <div className="text-lg font-semibold">{t.home_races}</div>
          <div className="mt-1 text-sm text-zinc-600">{t.home_races_desc}</div>
        </a>
      </div>
    </PageLayout>
  );
}
