import { formatDate, formatTimeHms, isSameLocalDay } from "@/lib/format";
import type { Translations } from "@/lib/i18n/translations";

function labelText(label: string): string {
  return label.replace(/:$/, "");
}

type Props = {
  startedAt: string;
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

export function WorkoutTimeRange({ startedAt, endedAt, t, locale }: Props) {
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
