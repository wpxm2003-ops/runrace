import type { ReactNode } from "react";

export function SectionHeader({
  title,
  eyebrow,
  action,
  className = "",
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            {eyebrow}
          </div>
        ) : null}
        <h2 className="text-lg font-bold tracking-[-0.025em] text-ink">{title}</h2>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
