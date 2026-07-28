"use client";

import type { User } from "firebase/auth";
import { usePersonalBests } from "@/lib/api";
import type { PersonalBestRow } from "@/lib/api/types";
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

/** 저장된 값은 초/km 페이스 — 러너에게 익숙한 "완주 시간"으로 환산한다. */
function pbTotalSec(pb: PersonalBestRow): number {
  return Math.round((pb.bestPaceSec * pb.distanceM) / 1000);
}

function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
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
    <div className="mt-4 border-t border-zinc-100 pt-4">
      <div className="text-sm font-medium text-zinc-900">{t.my_pb_heading}</div>
      <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-400">{t.my_pb_hint}</p>
      <div className="mt-2 divide-y divide-zinc-100">
        {pbs.map((pb) => {
          const totalSec = pbTotalSec(pb);
          return (
            <div key={pb.distanceKey} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm text-zinc-600">{pbLabel(pb.distanceKey, t)}</span>
              <span className="flex items-baseline gap-2">
                <span className="text-sm font-semibold tabular-nums text-zinc-900">
                  {formatDuration(totalSec)}
                </span>
                <span className="text-[11px] tabular-nums text-zinc-400">
                  {formatPace(pb.distanceM, totalSec, unit)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
