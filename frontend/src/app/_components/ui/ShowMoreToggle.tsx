"use client";

/**
 * 목록 하단 펼치기/접기 토글 — 크루 홈(보드·명예의 전당)과 레이스 상세(순위표·운동기록)가 공유한다.
 * 목록 자체는 호출 측이 잘라서 넘기고, 여기서는 토글 UI만 담당한다.
 */
export function ShowMoreToggle({
  open,
  onToggle,
  moreLabel,
  lessLabel,
}: {
  open: boolean;
  onToggle: () => void;
  moreLabel: string;
  lessLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="mt-1 flex w-full items-center justify-center gap-1 border-t border-zinc-100 pt-2.5 text-xs font-medium text-zinc-500 hover:text-zinc-900"
    >
      <span>{open ? lessLabel : moreLabel}</span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}
