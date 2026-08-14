/** 상세 화면 상단 액션 아이콘 버튼(공유·사진·메모·삭제)의 공통 클래스. */
export const ACTION_ICON_CLASS =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-transparent bg-transparent p-0 text-secondary transition-colors hover:bg-panel-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/35 disabled:opacity-40";

/** 공유 아이콘(점 3개 연결) — 레이스·운동 상세의 ShareButton 내용물. */
export function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.7 15.4 6.3M8.6 13.3l6.8 4.4" strokeLinecap="round" />
    </svg>
  );
}
