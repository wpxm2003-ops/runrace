"use client";

import { useState } from "react";
import { Badge } from "@/app/_components/ui/Badge";
import { Card } from "@/app/_components/ui/Card";
import { useLocale } from "@/lib/i18n";

/** 라이벌 기능 소개 — 예시 카드로 승률 비교 화면을 미리 보여준다(접기/펼치기). */
export function RivalPreviewSection() {
  const { t } = useLocale();
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <Card>
      <button
        type="button"
        onClick={() => setPreviewOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm text-zinc-600">{t.rival_description_toggle}</span>
        <span className="ml-2 shrink-0 text-sm text-zinc-400">{previewOpen ? "▲" : "▼"}</span>
      </button>
      {previewOpen && (
        <div className="mt-3">
          <div className="flex flex-col gap-2">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-500">1</span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-amber-900">씩씩한여우6720</span>
                      <Badge tone="amber">{t.rival_label}</Badge>
                    </div>
                    <div className="mt-0.5 text-[11px] font-medium text-amber-700">3승 2패</div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold text-zinc-900">62%</div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">24.80 / 40.00 km</div>
                </div>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full w-[62%] rounded-full bg-zinc-900" />
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-500">2</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-emerald-900">느린곰5495</span>
                    <Badge tone="emerald">{t.me_label}</Badge>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold text-emerald-700">45%</div>
                  <div className="mt-0.5 text-[11px] text-emerald-700">18.00 / 40.00 km</div>
                </div>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full w-[45%] rounded-full bg-emerald-600" />
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs font-medium text-zinc-400">{t.rival_preview_hint}</p>
          <p className="mt-3 text-xs font-medium text-zinc-400">{t.rival_guide}</p>
          <p className="mt-1 text-xs text-zinc-400">{t.rival_follow_notice}</p>
        </div>
      )}
    </Card>
  );
}
