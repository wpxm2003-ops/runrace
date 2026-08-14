const TONE_CLASSES = {
  brand: "bg-brand",
  ink: "bg-ink",
  light: "bg-white/75",
} as const;

export function ProgressBar({
  value,
  max = 100,
  ariaLabel,
  tone = "brand",
  inverse = false,
  className = "",
}: {
  value: number;
  max?: number;
  ariaLabel: string;
  tone?: keyof typeof TONE_CLASSES;
  inverse?: boolean;
  className?: string;
}) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = Number.isFinite(value) ? Math.min(Math.max(value, 0), safeMax) : 0;
  const percent = (safeValue / safeMax) * 100;

  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={Math.round(safeValue * 10) / 10}
      className={`h-1.5 w-full overflow-hidden rounded-pill ${inverse ? "bg-white/15" : "bg-zinc-100"} ${className}`}
    >
      <div
        className={`h-full rounded-pill transition-[width] duration-500 ${TONE_CLASSES[tone]}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
