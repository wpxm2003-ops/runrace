"use client";

import type { User } from "firebase/auth";
import Link from "next/link";
import { usePersonalBests } from "@/lib/api";
import { formatHms, pbFinishSec } from "@/lib/paceMath";
import { formatPace } from "@/lib/units";
import { useUnit } from "@/lib/UnitContext";
import { useLocale } from "@/lib/i18n";
import type { Translations } from "@/lib/i18n/translations";

function pbLabel(distanceKey: string, t: Translations): string {
  switch (distanceKey) {
    case "3k": return t.pb_3k;
    case "5k": return t.pb_5k;
    case "10k": return t.pb_10k;
    case "half": return t.pb_half;
    case "marathon": return t.pb_marathon;
    default: return distanceKey;
  }
}

/**
 * 개인 최고 기록 — 거리별 최고 구간 기록(요약 카드 안에 붙는 블록).
 * 기록이 하나도 없으면 렌더하지 않는다.
 */
export function PersonalBestsSection({ user }: { user: User }) {
  const { t } = useLocale();
  const { unit } = useUnit();
  const { data: pbs } = usePersonalBests(user);
  if (!pbs || pbs.length === 0) return null;

  return (
    <section className="mt-5 overflow-hidden rounded-hero bg-night p-card text-white shadow-float">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold">{t.my_pb_heading}</div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-white/45">{t.my_pb_hint}</p>
        </div>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-7 w-7 shrink-0 text-brand">
          <path d="M8 4h8v4a4 4 0 0 1-8 0V4ZM8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3M12 12v4M8 20h8M10 16h4v4" />
        </svg>
      </div>
      <div className="mt-3 divide-y divide-white/10">
        {pbs.map((pb) => {
          // 저장된 값은 초/km 페이스 — 러너에게 익숙한 "완주 시간"으로 환산한다.
          const totalSec = pbFinishSec(pb.bestPaceSec, pb.distanceM);
          return (
            <div key={pb.distanceKey} className="flex min-h-11 items-center gap-3 py-2">
              <span className="text-sm font-medium text-white/60">{pbLabel(pb.distanceKey, t)}</span>
              <span className="ml-auto flex items-baseline gap-2">
                <span className="rr-number text-sm font-bold text-white">
                  {formatHms(totalSec)}
                </span>
                <span className="rr-number text-[11px] text-brand">
                  {formatPace(pb.distanceM, totalSec, unit)}
                </span>
              </span>
              <Link
                href={`/workouts/${pb.workoutId}`}
                aria-label={`${pbLabel(pb.distanceKey, t)} ${t.workout_detail_title}`}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-lg text-white/45 transition-colors hover:bg-white/10 hover:text-brand"
              >
                <span aria-hidden="true">&gt;</span>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
