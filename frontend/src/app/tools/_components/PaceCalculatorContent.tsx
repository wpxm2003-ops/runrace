"use client";

import { useMemo, useState } from "react";
import { PageLayout } from "@/app/_components/PageLayout";
import { useLocale } from "@/lib/i18n";
import type { Translations } from "@/lib/i18n/translations";
import { formatPaceSecPerUnit } from "@/lib/units";
import {
  RACE_DISTANCES_KM,
  finishSecFromPace,
  formatHms,
  paceSecFromFinish,
  speedKmhFromPaceSec,
  splitPointsKm,
} from "@/lib/paceMath";
import { ToolsMoreLink } from "./ToolsMoreLink";

type DistKey = keyof typeof RACE_DISTANCES_KM | "custom";
type Mode = "time2pace" | "pace2time";

const DIST_OPTIONS: { key: DistKey; label: (t: Translations) => string }[] = [
  { key: "k5", label: (t) => t.pace_dist_5k },
  { key: "k10", label: (t) => t.pace_dist_10k },
  { key: "half", label: (t) => t.pace_dist_half },
  { key: "full", label: (t) => t.pace_dist_full },
  { key: "custom", label: (t) => t.pace_dist_custom },
];

/** SEO용 정적 페이스표 구간: 3'30"~8'00", 15초 간격. */
const PACE_TABLE_SECS = Array.from({ length: 19 }, (_, i) => 210 + i * 15);

const NUM_INPUT_CLASS =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-center tabular-nums";

function chipClass(selected: boolean): string {
  return selected
    ? "rounded-full bg-zinc-900 px-3.5 py-1.5 text-sm font-medium text-white"
    : "rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50";
}

/** 거리 표시: 불필요한 끝자리 없이 km 라벨로. 예: "5 km" / "21.1 km" */
function formatPointKm(km: number): string {
  return `${Number(km.toFixed(1))} km`;
}

export default function PaceCalculatorContent() {
  const { t } = useLocale();
  const [distKey, setDistKey] = useState<DistKey>("k10");
  const [customKm, setCustomKm] = useState("7");
  const [mode, setMode] = useState<Mode>("time2pace");
  const [h, setH] = useState("0");
  const [m, setM] = useState("55");
  const [s, setS] = useState("0");
  const [paceMin, setPaceMin] = useState("6");
  const [paceSec, setPaceSec] = useState("0");

  const distanceKm = distKey === "custom" ? Number(customKm) : RACE_DISTANCES_KM[distKey];

  const result = useMemo(() => {
    if (!(distanceKm > 0)) return null;
    let paceSecPerKm: number;
    let finishSec: number;
    if (mode === "time2pace") {
      finishSec = Number(h) * 3600 + Number(m) * 60 + Number(s);
      paceSecPerKm = paceSecFromFinish(distanceKm, finishSec);
    } else {
      paceSecPerKm = Number(paceMin) * 60 + Number(paceSec);
      finishSec = finishSecFromPace(distanceKm, paceSecPerKm);
    }
    if (!Number.isFinite(paceSecPerKm) || !Number.isFinite(finishSec) || paceSecPerKm <= 0) {
      return null;
    }
    return { paceSecPerKm, finishSec, speedKmh: speedKmhFromPaceSec(paceSecPerKm) };
  }, [distanceKm, mode, h, m, s, paceMin, paceSec]);

  const splits = useMemo(
    () =>
      result
        ? splitPointsKm(distanceKm).map((km) => ({ km, sec: km * result.paceSecPerKm }))
        : [],
    [distanceKm, result],
  );

  return (
    <PageLayout title={t.pace_title}>
      <p className="text-sm text-zinc-600">{t.pace_intro}</p>

      {/* 거리 선택 */}
      <div className="mt-6">
        <p className="text-xs font-medium text-zinc-500">{t.pace_distance}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {DIST_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setDistKey(o.key)}
              className={chipClass(distKey === o.key)}
            >
              {o.label(t)}
            </button>
          ))}
        </div>
        {distKey === "custom" ? (
          <div className="mt-3">
            <label className="text-xs font-medium text-zinc-500" htmlFor="pace-custom-km">
              {t.pace_custom_km}
            </label>
            <input
              id="pace-custom-km"
              className={`mt-1 ${NUM_INPUT_CLASS} max-w-40`}
              inputMode="decimal"
              value={customKm}
              onChange={(e) => setCustomKm(e.target.value)}
            />
          </div>
        ) : null}
      </div>

      {/* 모드 선택 */}
      <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-zinc-100 p-1">
        {(
          [
            ["time2pace", t.pace_mode_time2pace],
            ["pace2time", t.pace_mode_pace2time],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`rounded-lg px-2 py-2 text-sm font-medium ${
              mode === key ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 입력 */}
      {mode === "time2pace" ? (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(
            [
              [t.pace_h, h, setH],
              [t.pace_m, m, setM],
              [t.pace_s, s, setS],
            ] as const
          ).map(([label, value, setValue]) => (
            <div key={label}>
              <label className="text-xs font-medium text-zinc-500">{label}</label>
              <input
                className={`mt-1 ${NUM_INPUT_CLASS}`}
                inputMode="numeric"
                pattern="[0-9]*"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-label={label}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-xs font-medium text-zinc-500">{t.pace_input_pace}</p>
          <div className="mt-1 grid max-w-60 grid-cols-2 gap-2">
            {(
              [
                [t.pace_m, paceMin, setPaceMin],
                [t.pace_s, paceSec, setPaceSec],
              ] as const
            ).map(([label, value, setValue]) => (
              <input
                key={label}
                className={NUM_INPUT_CLASS}
                inputMode="numeric"
                pattern="[0-9]*"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-label={label}
              />
            ))}
          </div>
        </div>
      )}

      {/* 결과 */}
      {result ? (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-zinc-500">{t.pace_result_pace}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">
              {formatPaceSecPerUnit(result.paceSecPerKm)}
            </p>
            <p className="mt-0.5 text-xs text-zinc-400">
              {t.pace_result_speed} {result.speedKmh.toFixed(1)} km/h
            </p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-zinc-500">{t.pace_result_finish}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">
              {formatHms(result.finishSec)}
            </p>
            <p className="mt-0.5 text-xs text-zinc-400">{formatPointKm(distanceKm)}</p>
          </div>
        </div>
      ) : (
        <p className="mt-5 rounded-2xl bg-white p-4 text-sm text-zinc-400 shadow-sm">
          {t.pace_invalid}
        </p>
      )}

      {/* 구간 통과 시간 */}
      {result && splits.length > 1 ? (
        <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">{t.pace_splits_title}</h2>
          <p className="mt-1 text-xs text-zinc-400">{t.pace_splits_note}</p>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1.5 font-medium">{t.pace_splits_col_point}</th>
                <th className="py-1.5 text-right font-medium">{t.pace_splits_col_time}</th>
              </tr>
            </thead>
            <tbody>
              {splits.map((sp) => (
                <tr key={sp.km} className="border-t border-zinc-100">
                  <td className="py-1.5 tabular-nums">{formatPointKm(sp.km)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatHms(sp.sec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {/* 페이스별 완주 시간표(정적 콘텐츠) */}
      <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">{t.pace_table_title}</h2>
        <p className="mt-1 text-xs text-zinc-400">{t.pace_table_note}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1.5 font-medium">{t.pace_table_col_pace}</th>
                <th className="py-1.5 text-right font-medium">{t.pace_dist_5k}</th>
                <th className="py-1.5 text-right font-medium">{t.pace_dist_10k}</th>
                <th className="py-1.5 text-right font-medium">{t.pace_dist_half}</th>
                <th className="py-1.5 text-right font-medium">{t.pace_dist_full}</th>
              </tr>
            </thead>
            <tbody>
              {PACE_TABLE_SECS.map((sec) => (
                <tr key={sec} className="border-t border-zinc-100">
                  <td className="py-1.5 tabular-nums">{formatPaceSecPerUnit(sec)}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatHms(finishSecFromPace(RACE_DISTANCES_KM.k5, sec))}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatHms(finishSecFromPace(RACE_DISTANCES_KM.k10, sec))}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatHms(finishSecFromPace(RACE_DISTANCES_KM.half, sec))}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatHms(finishSecFromPace(RACE_DISTANCES_KM.full, sec))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 설명(정적 콘텐츠) */}
      <section className="mt-6">
        <h2 className="text-base font-semibold">{t.pace_guide_title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">{t.pace_guide_body}</p>
      </section>

      <ToolsMoreLink />
    </PageLayout>
  );
}
