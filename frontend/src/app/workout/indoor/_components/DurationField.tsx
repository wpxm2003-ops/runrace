import { useLocale } from "@/lib/i18n";

type Props = {
  hours: string;
  minutes: string;
  seconds: string;
  error?: string;
  onChange: (field: "hours" | "minutes" | "seconds", value: string) => void;
};

export function DurationField({ hours, minutes, seconds, error, onChange }: Props) {
  const { t } = useLocale();

  const inputClass = `w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none ${
    error ? "border-red-400 bg-red-50" : "border-zinc-200 bg-white focus:border-zinc-400"
  }`;

  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700">
        {t.indoor_field_duration}
        <span className="ml-0.5 text-red-500">*</span>
      </label>
      <div className="mt-1 flex gap-2">
        {(
          [
            { field: "hours", value: hours, max: 24, label: t.indoor_field_duration_h },
            { field: "minutes", value: minutes, max: 59, label: t.indoor_field_duration_m },
            { field: "seconds", value: seconds, max: 59, label: t.indoor_field_duration_s },
          ] as const
        ).map(({ field, value, max, label }) => (
          <div key={field} className="flex flex-1 items-center gap-1">
            <input
              type="number"
              min="0"
              max={max}
              placeholder="0"
              value={value}
              onChange={(e) => onChange(field, e.target.value)}
              className={inputClass}
            />
            <span className="shrink-0 text-sm text-zinc-500">{label}</span>
          </div>
        ))}
      </div>
      {error ? <p className="mt-1 text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
