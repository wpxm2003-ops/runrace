/**
 * 바텀시트/모달 상단 헤더 — 제목 + ✕ 닫기 버튼.
 * bordered=true: 자체 패딩(px-5 py-4)과 하단 구분선 포함 — 패널에 패딩이 없는 시트용.
 * bordered=false: 정렬 클래스만 — 패널이 p-5 패딩을 이미 가진 시트용(RejectModal 형태).
 */
export function SheetHeader({
  title,
  onClose,
  bordered = false,
  closeLabel,
}: {
  title: string;
  onClose: () => void;
  bordered?: boolean;
  closeLabel?: string;
}) {
  return (
    <div
      className={
        bordered
          ? "flex items-center justify-between border-b border-zinc-100 px-5 py-4"
          : "flex items-center justify-between"
      }
    >
      <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="-mr-1 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100"
      >
        ✕
      </button>
    </div>
  );
}
