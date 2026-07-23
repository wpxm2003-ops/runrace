"use client";

import type { PrizeAwardType, PrizeFormItem } from "@/lib/api/types";
import { useLocale } from "@/lib/i18n";
import { AccordionRow } from "./AccordionRow";

/**
 * 경품 아코디언 섹션 — 생성/수정 폼이 공유한다.
 * 목록 표시 + '추가/편집' 버튼만 담당하고, 실제 편집 모달은 호출부(onEdit)가 연다.
 */
export function PrizeAccordionSection({
  prizes,
  awardType,
  maxRank,
  open,
  onToggle,
  onEdit,
  disabled = false,
  disabledHint,
}: {
  prizes: PrizeFormItem[];
  awardType: PrizeAwardType;
  maxRank: number;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  /** 내기와 양자택일 — 내기가 걸려 있으면 비활성화. */
  disabled?: boolean;
  disabledHint?: string;
}) {
  const { t } = useLocale();
  return (
    <AccordionRow
      label={t.prize_section_title}
      active={prizes.length > 0}
      open={open}
      onToggle={onToggle}
      disabled={disabled}
      disabledHint={disabledHint}
    >
      <p className="text-[11px] leading-relaxed text-zinc-400">
        {awardType === "RANK" ? t.prize_section_hint(maxRank) : t.prize_random_hint}
      </p>
      {prizes.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {prizes.map((p) => (
            <li key={p.rank} className="flex items-center gap-2 text-sm text-zinc-700">
              <span className="font-semibold text-zinc-900">
                {awardType === "RANK" ? t.prize_rank_label(p.rank) : t.prize_item_label(p.rank)}
              </span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {p.imageKey || p.keepImage ? (
                <span className="shrink-0 text-[10px] text-emerald-600">{t.prize_has_image_badge}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        onClick={onEdit}
        className="mt-2 rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
      >
        {prizes.length ? t.prize_edit_btn : t.prize_add_btn}
      </button>
    </AccordionRow>
  );
}
