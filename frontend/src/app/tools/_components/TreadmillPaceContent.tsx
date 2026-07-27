"use client";

import { useMemo, useState } from "react";
import { PageLayout } from "@/app/_components/PageLayout";
import { useLocale } from "@/lib/i18n";
import { formatPaceSecPerUnit } from "@/lib/units";
import { finishSecFromPace, formatHms, mphFromKmh, paceSecFromSpeedKmh } from "@/lib/paceMath";
import { ToolsMoreLink } from "./ToolsMoreLink";

/** SEO용 정적 환산표 구간: 5.0~16.0 km/h, 0.5 간격. */
const TABLE_SPEEDS_KMH = Array.from({ length: 23 }, (_, i) => 5 + i * 0.5);

export default function TreadmillPaceContent() {
  const { t } = useLocale();
  const [speed, setSpeed] = useState("10");

  const result = useMemo(() => {
    const kmh = Number(speed);
    const paceSec = paceSecFromSpeedKmh(kmh);
    if (!Number.isFinite(paceSec)) return null;
    return {
      paceSec,
      mph: mphFromKmh(kmh),
      fiveKmSec: finishSecFromPace(5, paceSec),
    };
  }, [speed]);

  return (
    <PageLayout title={t.tm_title}>
      <p className="text-sm text-zinc-600">{t.tm_intro}</p>

      {/* 입력 */}
      <div className="mt-6">
        <label className="text-xs font-medium text-zinc-500" htmlFor="tm-speed">
          {t.tm_speed}
        </label>
        <input
          id="tm-speed"
          className="mt-1 h-11 w-full max-w-40 rounded-xl border border-zinc-200 bg-white px-3 text-center tabular-nums"
          inputMode="decimal"
          value={speed}
          onChange={(e) => setSpeed(e.target.value)}
        />
      </div>

      {/* 결과 */}
      {result ? (
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-zinc-500">{t.tm_result_pace}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-zinc-900">
              {formatPaceSecPerUnit(result.paceSec)}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-zinc-500">{t.tm_result_mph}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-zinc-900">
              {result.mph.toFixed(1)}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-zinc-500">{t.tm_result_5k}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-zinc-900">
              {formatHms(result.fiveKmSec)}
            </p>
          </div>
        </div>
      ) : null}

      {/* 환산표(정적 콘텐츠) */}
      <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">{t.tm_table_title}</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1.5 font-medium">{t.tm_col_speed}</th>
                <th className="py-1.5 text-right font-medium">{t.tm_col_pace}</th>
                <th className="py-1.5 text-right font-medium">{t.tm_col_mph}</th>
                <th className="py-1.5 text-right font-medium">{t.tm_col_5k}</th>
              </tr>
            </thead>
            <tbody>
              {TABLE_SPEEDS_KMH.map((kmh) => {
                const paceSec = paceSecFromSpeedKmh(kmh);
                return (
                  <tr key={kmh} className="border-t border-zinc-100">
                    <td className="py-1.5 tabular-nums">{kmh.toFixed(1)}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatPaceSecPerUnit(paceSec)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{mphFromKmh(kmh).toFixed(1)}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatHms(finishSecFromPace(5, paceSec))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 설명(정적 콘텐츠) */}
      <section className="mt-6">
        <h2 className="text-base font-semibold">{t.tm_guide_title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">{t.tm_guide_body}</p>
      </section>

      <ToolsMoreLink />
    </PageLayout>
  );
}
