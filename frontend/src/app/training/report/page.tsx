"use client";

import Link from "next/link";
import { PageLayout } from "@/app/_components/PageLayout";
import { Card } from "@/app/_components/ui/Card";
import { LoadingCard } from "@/app/_components/ui/LoadingCard";
import { useNsmMyReport } from "@/lib/api";
import type { NsmRetestPoint } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { formatPaceSec } from "@/lib/nsm";
import { nsmReportHref } from "@/lib/nsmReportRoute";
import { useLocale } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/useRequireAuth";

const CHART_W = 320;
const CHART_H = 120;
const PAD_X = 12;
const PAD_Y = 14;

/**
 * 역치 페이스 추이 스파크라인. y축은 그대로 초/km를 선형 매핑한다 — 값이 작을수록(=빨라질수록)
 * 화면 위쪽에 찍혀 "선이 올라가면 좋아진 것"이라는 직관과 자연히 맞는다(별도 반전 불필요).
 */
function toChartPoints(paces: number[]): (readonly [number, number])[] {
  const min = Math.min(...paces);
  const max = Math.max(...paces);
  const range = Math.max(max - min, 1);
  const stepX = paces.length > 1 ? (CHART_W - PAD_X * 2) / (paces.length - 1) : 0;
  return paces.map((p, i) => {
    const x = PAD_X + i * stepX;
    const y = PAD_Y + ((p - min) / range) * (CHART_H - PAD_Y * 2);
    return [x, y] as const;
  });
}

function buildLinePath(points: (readonly [number, number])[]): string {
  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
}

function ThresholdTrendChart({ retests }: { retests: NsmRetestPoint[] }) {
  const points = toChartPoints(retests.map((r) => r.thresholdPaceSec));
  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="h-32 w-full overflow-visible">
      <path d={buildLinePath(points)} fill="none" stroke="#059669" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      {points.map(([x, y], i) => (
        <circle key={retests[i].id} cx={x} cy={y} r={i === points.length - 1 ? 4.5 : 3} fill="#059669" />
      ))}
      <line x1={PAD_X} y1={CHART_H - PAD_Y} x2={CHART_W - PAD_X} y2={CHART_H - PAD_Y} stroke="#e4e4e7" strokeWidth="1" />
    </svg>
  );
}

/** 시작→끝 값 변화. positive=개선(더 좋아짐) — betterWhenLower로 지표별(페이스↓좋음/VDOT↑좋음) 방향을 받는다. */
function delta(start: number, end: number, betterWhenLower: boolean): { diff: number; improved: boolean } {
  const diff = end - start;
  const improved = betterWhenLower ? diff <= 0 : diff >= 0;
  return { diff, improved };
}

function DeltaBadge({ diff, improved, suffix }: { diff: number; improved: boolean; suffix: string }) {
  if (diff === 0) return <span className="text-xs text-zinc-400">–</span>;
  const arrow = diff > 0 ? "▲" : "▼";
  return (
    <span className={`text-xs font-medium ${improved ? "text-emerald-600" : "text-amber-600"}`}>
      {arrow} {Math.abs(diff)}
      {suffix}
    </span>
  );
}

function BlocksList({ retests, locale }: { retests: NsmRetestPoint[]; locale: string }) {
  const { t } = useLocale();
  // 최신 블록이 위로 오게 역순 — 블록 = 연속된 재측정 두 점 사이 구간.
  const blocks = [];
  for (let i = retests.length - 1; i > 0; i--) {
    blocks.push({ start: retests[i - 1], end: retests[i] });
  }

  return (
    <Card className="mt-4">
      <div className="text-sm font-semibold text-zinc-900">{t.nsm_report_blocks_title}</div>
      <div className="mt-3 flex flex-col gap-2">
        {blocks.map(({ start, end }) => {
          const days = Math.max(
            1,
            Math.round((new Date(end.createdAt).getTime() - new Date(start.createdAt).getTime()) / 86400000),
          );
          const paceDelta = delta(start.thresholdPaceSec, end.thresholdPaceSec, true);
          const vdotDelta = delta(start.vdot, end.vdot, false);
          return (
            <Link
              key={end.id}
              href={nsmReportHref(end.id)}
              className="flex items-center justify-between gap-3 rounded-xl border border-zinc-100 p-3 hover:bg-zinc-50"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-zinc-900">{formatDate(end.createdAt, locale)}</div>
                <div className="mt-0.5 text-[11px] text-zinc-400">{t.nsm_report_block_days(days)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="text-right">
                  <div className="text-[10px] text-zinc-400">{t.nsm_block_threshold_label}</div>
                  <DeltaBadge diff={paceDelta.diff} improved={paceDelta.improved} suffix="초/km" />
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-zinc-400">VDOT</div>
                  <DeltaBadge diff={Math.round(vdotDelta.diff * 10) / 10} improved={vdotDelta.improved} suffix="" />
                </div>
                <span className="text-xs text-zinc-400">{t.nsm_report_block_view} ›</span>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

function NsmReportContent({ user }: { user: NonNullable<ReturnType<typeof useRequireAuth>["user"]> }) {
  const { t, locale } = useLocale();
  const { data: report, isLoading } = useNsmMyReport(user);

  if (isLoading || !report) {
    return (
      <PageLayout title={t.nsm_report_title} maxWidth="max-w-md">
        <LoadingCard />
      </PageLayout>
    );
  }

  const { retests } = report;

  return (
    <PageLayout title={t.nsm_report_title} maxWidth="max-w-md">
      {retests.length === 0 ? (
        <Card>
          <p className="text-sm leading-relaxed text-zinc-500">{t.nsm_report_empty}</p>
          <Link
            href="/training"
            className="mt-3 block rounded-lg bg-zinc-900 py-2.5 text-center text-sm font-semibold text-white"
          >
            {t.nsm_report_empty_cta}
          </Link>
        </Card>
      ) : (
        <>
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-zinc-500">{t.nsm_report_stat_completed}</div>
                <div className="mt-0.5 text-2xl font-bold text-zinc-900">
                  {t.nsm_report_unit_sessions(report.totalSubTCompleted)}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">{t.nsm_report_stat_minutes}</div>
                <div className="mt-0.5 text-2xl font-bold text-zinc-900">
                  {t.nsm_report_unit_minutes(report.totalSubTMinutes)}
                </div>
              </div>
            </div>
          </Card>

          {retests.length === 1 ? (
            <Card className="mt-4">
              <div className="text-sm font-semibold text-zinc-900">{t.nsm_report_chart_title}</div>
              <div className="mt-2 text-3xl font-bold text-zinc-900">
                {formatPaceSec(retests[0].thresholdPaceSec)}
                <span className="ml-1 text-base font-medium text-zinc-400">/km</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">{t.nsm_report_single_hint}</p>
            </Card>
          ) : (
            <Card className="mt-4">
              <div className="flex items-baseline justify-between">
                <div className="text-sm font-semibold text-zinc-900">{t.nsm_report_chart_title}</div>
                <div className="text-lg font-bold text-zinc-900">
                  {formatPaceSec(retests[retests.length - 1].thresholdPaceSec)}
                  <span className="ml-1 text-xs font-medium text-zinc-400">/km</span>
                </div>
              </div>
              <div className="mt-2">
                <ThresholdTrendChart retests={retests} />
              </div>
            </Card>
          )}

          {retests.length >= 2 ? (
            <Link
              href={nsmReportHref(retests[retests.length - 1].id)}
              className="mt-4 block rounded-xl bg-zinc-900 py-3 text-center text-sm font-semibold text-white"
            >
              🎉 {t.nsm_report_share_latest}
            </Link>
          ) : null}

          {retests.length >= 2 ? <BlocksList retests={retests} locale={locale} /> : null}
        </>
      )}
    </PageLayout>
  );
}

export default function NsmReportPage() {
  const { user, loading } = useRequireAuth("/training/report");
  const { t } = useLocale();

  if (loading || !user) {
    return (
      <PageLayout title={t.nsm_report_title} maxWidth="max-w-md">
        <LoadingCard />
      </PageLayout>
    );
  }

  return <NsmReportContent user={user} />;
}
