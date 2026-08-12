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
  //
  // ⚠️ 알려진 한계(서머타임): 오프셋 없는 문자열을 new Date에 넣으면 뷰어 타임존 규칙으로
  // 해석되므로, 뷰어가 서머타임 지역이고 이 구간이 전환 시각에 걸치면 유도된 종료가 1시간
  // 어긋난다(실측: 뉴욕 뷰어에서 "2027-03-14T01:30:00"+1h → 02:30이 아닌 03:30). 한국은
  // 서머타임이 없어 현재 사용자에게는 발생하지 않는다.
  // 고칠 때는 UTC 프레임에서 계산할 것 — Date.parse(wall + "Z") 후 getUTC*로 되읽기.
  // 단, 기록 당시 그 지역이 전환을 걸친 경우는 이 방법으로도 복원 불가(endedAtLocal 저장 필요).
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
