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
      className="grid w-full grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 ring-1 ring-inset ring-zinc-200/70"
    >
      {ORDER.map((key) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(key)}
            className={`min-w-0 rounded-lg px-1 py-2.5 text-center text-xs font-semibold transition-all sm:text-sm ${
              active
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/90"
                : "text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-800"
            }`}
          >
            {labels[key]}
          </button>
        );
      })}
    </div>
  );
}
