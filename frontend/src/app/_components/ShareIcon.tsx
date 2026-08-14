/** 상세 화면 상단 액션 아이콘 버튼(공유·사진·메모·삭제)의 공통 클래스. */
export const ACTION_ICON_CLASS =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-line bg-panel p-0 text-ink hover:bg-panel-muted disabled:opacity-50";

/** 공유 아이콘(점 3개 연결) — 레이스·운동 상세의 ShareButton 내용물. */
export function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.7 15.4 6.3M8.6 13.3l6.8 4.4" strokeLinecap="round" />
    </svg>
  );
}
