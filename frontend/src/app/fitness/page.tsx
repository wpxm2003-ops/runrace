"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { syncDailyDistance } from "@/lib/api";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { useState } from "react";

export default function FitnessPage() {
  const { user } = useRequireAuth("/fitness");
  const { t } = useLocale();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState("apple_health");
  const [distanceKm, setDistanceKm] = useState("5.0");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSync() {
    if (!user) return;
    setError(null);
    setResult(null);
    try {
      const res = await syncDailyDistance({ date, source, distanceKm: Number(distanceKm) }, user);
      setResult(`prev=${res.prevKm} now=${res.nowKm} delta=${res.deltaKm}`);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <PageLayout title={t.fitness_title} maxWidth="max-w-md">
      <Card padding="p-6">
        <p className="text-sm text-zinc-600">{t.fitness_desc}</p>
        <div className="mt-6 grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-600">{t.fitness_date}</span>
            <input className="h-11 rounded-xl border border-zinc-200 px-3" value={date} onChange={(e) => setDate(e.target.value)} type="date" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-600">{t.fitness_source}</span>
            <select className="h-11 rounded-xl border border-zinc-200 px-3" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="apple_health">apple_health</option>
              <option value="samsung_health">samsung_health</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-600">{t.fitness_distance}</span>
            <input className="h-11 rounded-xl border border-zinc-200 px-3" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} inputMode="decimal" />
          </label>
          <button type="button" onClick={onSync} className="mt-2 h-11 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800">
            {t.fitness_upload}
          </button>
        </div>
        {result ? <Alert tone="success" className="mt-4">{result}</Alert> : null}
        {error ? <Alert className="mt-4">{error}</Alert> : null}
      </Card>
    </PageLayout>
  );
}
