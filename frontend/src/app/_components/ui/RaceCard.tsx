import Link from "next/link";
import { ProgressBar } from "./ProgressBar";

export type RaceCardRunner = {
  label: string;
  value: string;
  progress: number;
  isMe?: boolean;
};

export function RaceCard({
  href,
  eyebrow,
  title,
  statusLabel,
  meta,
  runners,
  progressLabel,
}: {
  href: string;
  eyebrow: string;
  title: string;
  statusLabel?: string;
  meta?: string;
  runners: RaceCardRunner[];
  progressLabel: (runnerLabel: string) => string;
}) {
  return (
    <Link
      href={href}
      className="group relative block overflow-hidden rounded-hero bg-night p-card text-white shadow-float transition-transform active:scale-[0.99]"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 260 180"
        className="pointer-events-none absolute -right-16 -top-16 h-52 w-72 text-brand opacity-20"
        fill="none"
      >
        <path d="M260 18C166 4 81 41 57 92c-22 47 20 74 94 76" stroke="currentColor" strokeWidth="2" />
        <path d="M260 42c-82-12-151 17-171 57-18 37 16 58 78 61" stroke="white" strokeOpacity=".22" strokeWidth="2" />
        <path d="M260 67c-67-9-119 11-134 41-12 25 12 40 59 42" stroke="currentColor" strokeWidth="2" />
      </svg>

      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">
            {eyebrow}
          </span>
          {statusLabel ? (
            <span className="rounded-pill bg-sky-100 px-2.5 py-1 text-[10px] font-bold text-sky-700">
              {statusLabel}
            </span>
          ) : null}
        </div>

        <div className="mt-2 flex items-center justify-between gap-4">
          <h3 className="min-w-0 truncate text-lg font-bold tracking-[-0.025em]">{title}</h3>
          <span className="text-xl text-white/45 transition-transform group-hover:translate-x-0.5" aria-hidden="true">
            ›
          </span>
        </div>

        <div className={`mt-5 grid gap-4 ${runners.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {runners.slice(0, 2).map((runner) => (
            <div key={`${runner.label}-${runner.value}`} className="min-w-0">
              <div className={`truncate text-[11px] font-medium ${runner.isMe ? "text-emerald-400" : "text-white/55"}`}>
                {runner.label}
              </div>
              <div className="rr-number mt-1 text-2xl font-black tracking-tight">{runner.value}</div>
              <ProgressBar
                value={runner.progress}
                ariaLabel={progressLabel(runner.label)}
                tone={runner.isMe ? "emerald" : "light"}
                inverse
                className="mt-2"
              />
            </div>
          ))}
        </div>

        {meta ? <div className="mt-4 text-[11px] text-white/45">{meta}</div> : null}
      </div>
    </Link>
  );
}
