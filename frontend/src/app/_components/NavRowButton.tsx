"use client";

/** 우측 › 셰브런으로 다른 화면으로 이동하는 행 버튼. 선택적 부제목(2줄) 지원. */
export function NavRowButton({
  title,
  subtitle,
  onClick,
  className,
}: {
  title: string;
  subtitle?: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-left hover:bg-zinc-50${className ? ` ${className}` : ""}`}
    >
      <div className="min-w-0">
        <div className="text-base font-semibold text-zinc-900">{title}</div>
        {subtitle ? <div className="mt-0.5 text-xs text-zinc-500">{subtitle}</div> : null}
      </div>
      <span aria-hidden className="shrink-0 text-zinc-400">
        ›
      </span>
    </button>
  );
}
