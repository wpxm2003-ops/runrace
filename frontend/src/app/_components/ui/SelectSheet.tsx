"use client";

import { BottomSheet } from "./BottomSheet";
import { useLocale } from "@/lib/i18n";

export type SelectOption = {
  value: string;
  label: string;
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="m4 10 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M5 5 15 15M15 5 5 15" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 바텀시트 형태의 단일 선택 목록. title이 있으면 헤더(제목+닫기버튼)를 렌더링하고,
 * 없으면 목록만 보여준다(이 경우 panelClassName이 스크롤/여백을 직접 책임진다).
 */
export function SelectSheet({
  title,
  value,
  options,
  onSelect,
  onClose,
  zIndexClass,
  panelClassName,
}: {
  title?: string;
  value: string;
  options: SelectOption[];
  onSelect: (value: string) => void;
  onClose: () => void;
  zIndexClass?: string;
  panelClassName: string;
}) {
  const { t } = useLocale();

  return (
    <BottomSheet onClose={onClose} zIndexClass={zIndexClass} panelClassName={panelClassName}>
      {title ? (
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="-mr-1 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100"
          >
            <CloseIcon />
          </button>
        </div>
      ) : null}
      <ul role="listbox" className={title ? "overflow-y-auto py-2" : undefined}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onSelect(option.value);
                  onClose();
                }}
                className={`flex w-full items-center justify-between px-5 py-3 text-left text-sm ${
                  selected ? "font-semibold text-zinc-900" : "text-zinc-700"
                } active:bg-zinc-100`}
              >
                <span>{option.label}</span>
                {selected ? <CheckIcon /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
}
