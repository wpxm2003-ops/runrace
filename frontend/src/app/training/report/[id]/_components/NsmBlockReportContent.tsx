"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { mapErrorMessage, useNsmBlockReport } from "@/lib/api";
import { parseNsmReportIdFromPath } from "@/lib/nsmReportRoute";
import { useRouteId } from "@/lib/useRouteId";
import { formatPaceSec } from "@/lib/nsm";
import { formatDistance } from "@/lib/units";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { captureAndSaveCard } from "@/lib/storyCard";
import Link from "next/link";

const COLOR = {
  gray: "#7E828B",
  green: "#34D399",
  amber: "#FBBF24",
  divider: "#1F2127",
  footer: "#5C606A",
};
const FONT =
  'ui-sans-serif, system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

/** 레이스 기록(초) → "m:ss". training/page.tsx의 로컬 포맷터와 동일 로직(공유 목적이 달라 별도 유지). */
function formatRaceTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function NsmBlockReportContent() {
  const id = useRouteId(parseNsmReportIdFromPath);
  const { t } = useLocale();
  const { unit } = useUnit();
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const { data, error } = useNsmBlockReport(id);

  const viewTrackedRef = useRef(false);
  useEffect(() => {
    if (data && !viewTrackedRef.current) {
      viewTrackedRef.current = true;
      void track("nsm_block_view");
    }
  }, [data]);

  if (error) {
    const message = mapErrorMessage(
      error,
      [{ codes: ["no_previous_retest"], message: t.nsm_block_no_previous }],
      () => t.nsm_block_not_found,
    );
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-zinc-50 px-6 text-center">
        <p className="text-sm text-zinc-500">{message}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-zinc-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  const paceDiff = data.endThresholdPaceSec - data.startThresholdPaceSec; // 음수 = 빨라짐
  const vdotDiff = Math.round((data.endVdot - data.startVdot) * 10) / 10;

  async function onSaveImage() {
    const node = cardRef.current;
    if (!node || busy) return;
    setBusy(true);
    try {
      const result = await captureAndSaveCard(node, "runrace-nsm-report");
      if (result === "saved") void track("nsm_block_image_saved");
    } catch (e) {
      if ((e as { name?: string })?.name !== "AbortError") {
        toast.error(t.nsm_block_save_error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-zinc-50">
      <main className="mx-auto w-full max-w-sm space-y-3 px-4 py-6">
        <h1 className="text-lg font-bold text-zinc-900">{t.nsm_block_title}</h1>
        <p className="text-xs text-zinc-500">{t.nsm_block_period(data.days)}</p>

        <div
          className="rounded-3xl p-5 shadow-sm"
          style={{ background: "linear-gradient(180deg, #0B0C10 0%, #17191F 100%)" }}
        >
          <div className="text-xs" style={{ color: COLOR.gray }}>
            {t.nsm_block_threshold_label}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-white line-through opacity-50">
              {formatPaceSec(data.startThresholdPaceSec)}
            </span>
            <span className="text-3xl font-semibold text-white">→</span>
            <span className="text-3xl font-bold" style={{ color: COLOR.green }}>
              {formatPaceSec(data.endThresholdPaceSec)}
            </span>
          </div>
          <div className="mt-1 text-sm font-medium" style={{ color: paceDiff <= 0 ? COLOR.green : COLOR.amber }}>
            {paceDiff <= 0 ? "▼" : "▲"} {Math.abs(paceDiff)}
            {t.nsm_unit_sec_per_km}
          </div>

          <div className="my-4 h-px" style={{ background: COLOR.divider }} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs" style={{ color: COLOR.gray }}>
                {t.nsm_block_vdot_label}
              </div>
              <div className="mt-0.5 text-lg font-semibold text-white">
                {data.startVdot.toFixed(1)} → {data.endVdot.toFixed(1)}
                {/* 반올림 후 0이면 "(+0)"처럼 무의미한 델타는 표기하지 않는다(대시보드의 "–" 처리와 동일 취지) */}
                {vdotDiff !== 0 && (
                  <span className="ml-1 text-xs font-medium" style={{ color: vdotDiff > 0 ? COLOR.green : COLOR.amber }}>
                    ({vdotDiff > 0 ? "+" : ""}
                    {vdotDiff})
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs" style={{ color: COLOR.gray }}>
                {t.nsm_block_source_label}
              </div>
              <div className="mt-0.5 text-sm font-semibold text-white">
                {formatDistance(data.endSourceDistanceM, unit)} {formatRaceTime(data.endSourceTimeSec)}
              </div>
            </div>
          </div>

          <div className="my-4 h-px" style={{ background: COLOR.divider }} />

          <div className="text-xs" style={{ color: COLOR.gray }}>
            {t.nsm_block_subt_label}
          </div>
          <div className="mt-0.5 text-lg font-semibold text-white">
            {t.nsm_report_unit_sessions(data.subTCompleted)} · {t.nsm_report_unit_minutes(data.subTMinutes)}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void onSaveImage()}
          disabled={busy}
          className="block w-full rounded-2xl border border-zinc-200 bg-white py-3 text-center text-sm font-semibold text-zinc-700 shadow-sm disabled:opacity-50"
        >
          {busy ? t.nsm_block_save_busy : `📸 ${t.nsm_block_save_image}`}
        </button>

        <Link
          href="/login"
          onClick={() => void track("nsm_block_cta_click")}
          className="block rounded-2xl bg-zinc-900 px-4 py-4 text-center text-sm font-semibold text-white shadow-sm hover:bg-zinc-800"
        >
          {t.nsm_block_cta} →
        </Link>
      </main>

      {/* 캡처 전용 오프스크린 카드(1080×1920, 그래픽 스토리 카드와 동일 톤) */}
      <div aria-hidden="true" style={{ position: "fixed", left: "-99999px", top: 0, pointerEvents: "none" }}>
        <div
          ref={cardRef}
          style={{
            width: 1080,
            height: 1920,
            boxSizing: "border-box",
            padding: "140px 100px 90px",
            background: "linear-gradient(180deg, #0B0C10 0%, #17191F 100%)",
            color: "#FFFFFF",
            fontFamily: FONT,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ fontSize: 42, color: COLOR.gray, letterSpacing: 1 }}>{t.nsm_block_threshold_label}</div>
          <div style={{ marginTop: 16, display: "flex", alignItems: "baseline", gap: 18 }}>
            <span style={{ fontSize: 70, fontWeight: 600, opacity: 0.45, textDecoration: "line-through" }}>
              {formatPaceSec(data.startThresholdPaceSec)}
            </span>
            <span style={{ fontSize: 70, fontWeight: 600, opacity: 0.6 }}>→</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 148, fontWeight: 800, lineHeight: 1, letterSpacing: -3, color: COLOR.green }}>
            {formatPaceSec(data.endThresholdPaceSec)}
          </div>
          <div
            style={{
              marginTop: 20,
              fontSize: 48,
              fontWeight: 700,
              color: paceDiff <= 0 ? COLOR.green : COLOR.amber,
            }}
          >
            {paceDiff <= 0 ? "▼" : "▲"} {Math.abs(paceDiff)}
            {t.nsm_unit_sec_per_km}
          </div>

          <div style={{ marginTop: 70, height: 1, background: COLOR.divider }} />

          <div style={{ marginTop: 64, display: "flex", gap: 90 }}>
            <div>
              <div style={{ fontSize: 34, color: COLOR.gray }}>{t.nsm_block_vdot_label}</div>
              <div style={{ marginTop: 10, fontSize: 56, fontWeight: 700 }}>
                {data.startVdot.toFixed(1)} → {data.endVdot.toFixed(1)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 34, color: COLOR.gray }}>{t.nsm_block_source_label}</div>
              <div style={{ marginTop: 10, fontSize: 56, fontWeight: 700 }}>
                {formatDistance(data.endSourceDistanceM, unit)} {formatRaceTime(data.endSourceTimeSec)}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 64 }}>
            <div style={{ fontSize: 34, color: COLOR.gray }}>{t.nsm_block_subt_label}</div>
            <div style={{ marginTop: 10, fontSize: 56, fontWeight: 700 }}>
              {t.nsm_report_unit_sessions(data.subTCompleted)} · {t.nsm_report_unit_minutes(data.subTMinutes)}
            </div>
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ fontSize: 44, color: COLOR.gray }}>{t.nsm_block_period(data.days)}</div>
          <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: COLOR.green }} />
            <div style={{ fontSize: 40, color: COLOR.footer }}>runrace.co.kr</div>
          </div>
        </div>
      </div>
    </div>
  );
}
