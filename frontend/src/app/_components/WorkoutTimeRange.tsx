import { formatDate, formatTimeHms, isSameLocalDay, toWallClockIso } from "@/lib/format";
import type { Translations } from "@/lib/i18n/translations";

function labelText(label: string): string {
  return label.replace(/:$/, "");
}

type Props = {
  startedAt: string;
  /** 기기 벽시계(타임존 없음). 있으면 뷰어 타임존 변환 대신 기록된 현지 시각을 보여준다. */
  startedAtLocal?: string;
  endedAt: string;
  t: Translations;
  locale: string;
};

function TimeCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[3rem] flex-col">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums text-zinc-900">{value}</div>
    </div>
  );
}

function DateTimeCell({ label, iso, locale }: { label: string; iso: string; locale: string }) {
  return (
    <div className="flex min-h-[4.25rem] flex-col rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums text-zinc-900">
        {formatDate(iso, locale)}
      </div>
      <div className="text-sm font-semibold tabular-nums text-zinc-900">
        {formatTimeHms(iso)}
      </div>
    </div>
  );
}

export function WorkoutTimeRange({ startedAt, startedAtLocal, endedAt, t, locale }: Props) {
  // 패턴 A: 뛴 그 순간의 벽시계를 보여준다. 여행 후 돌아와서 봐도 "그날 그 시각" 그대로다.
  // 종료 벽시계는 시작 벽시계 + 실제 경과(UTC 차)로 유도한다 — 별도 필드가 필요 없다.
  // (오프셋 없는 문자열은 new Date가 뷰어 타임존으로 해석하지만, 여기서 쓰는 건
  //  벽시계 필드뿐이라 어떤 타임존에서 계산해도 같은 결과가 나온다.)
  if (startedAtLocal) {
    const elapsedMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
    startedAt = startedAtLocal;
    endedAt = toWallClockIso(new Date(startedAtLocal).getTime() + elapsedMs);
  }
  const startLabel = labelText(t.workout_start_label);
  const endLabel = labelText(t.workout_end_label);

  if (isSameLocalDay(startedAt, endedAt)) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="text-sm font-semibold tabular-nums text-zinc-900">
          {formatDate(startedAt, locale)}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-3">
          <TimeCell label={startLabel} value={formatTimeHms(startedAt)} />
          <TimeCell label={endLabel} value={formatTimeHms(endedAt)} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <DateTimeCell label={startLabel} iso={startedAt} locale={locale} />
      <DateTimeCell label={endLabel} iso={endedAt} locale={locale} />
    </div>
  );
}
