/** 인사이트 스탯 타일 — 지난주 대비/내 기여/누적. */
export function StatTile({ label, value, tone }: { label: string; value: string; tone?: "green" }) {
  return (
    <div className="min-w-0 text-center">
      <div className="truncate text-[11px] text-zinc-400">{label}</div>
      <div
        className={`mt-1 truncate text-sm font-semibold tabular-nums ${
          tone === "green" ? "text-emerald-600" : "text-zinc-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
