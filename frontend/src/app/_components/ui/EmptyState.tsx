import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
  inverse = false,
  className = "",
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  inverse?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center px-5 py-8 text-center ${className}`}>
      {icon ? (
        <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-full ${inverse ? "bg-white/10 text-white" : "bg-brand-soft text-brand"}`}>
          {icon}
        </div>
      ) : null}
      <div className={`text-sm font-semibold ${inverse ? "text-white" : "text-ink"}`}>{title}</div>
      {description ? (
        <div className={`mt-1 max-w-xs text-xs leading-relaxed ${inverse ? "text-white/55" : "text-muted"}`}>
          {description}
        </div>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
