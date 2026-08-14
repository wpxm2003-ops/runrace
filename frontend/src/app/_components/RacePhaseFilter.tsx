"use client";

export type RacePhaseFilterValue = "active" | "ended";

const ORDER: RacePhaseFilterValue[] = ["active", "ended"];

type Props = {
  value: RacePhaseFilterValue;
  onChange: (value: RacePhaseFilterValue) => void;
  labels: Record<RacePhaseFilterValue, string>;
  ariaLabel: string;
};

export function RacePhaseFilter({ value, onChange, labels, ariaLabel }: Props) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="grid w-full grid-cols-2 gap-1 rounded-control border border-line bg-panel-muted p-1"
    >
      {ORDER.map((key) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(key)}
            className={`min-w-0 rounded-[0.625rem] px-1 py-2.5 text-center text-xs font-semibold transition-all sm:text-sm ${
              active
                ? "bg-panel text-brand shadow-card"
                : "text-muted hover:bg-white/70 hover:text-ink"
            }`}
          >
            {labels[key]}
          </button>
        );
      })}
    </div>
  );
}
