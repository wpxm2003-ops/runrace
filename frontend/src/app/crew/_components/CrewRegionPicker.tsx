"use client";

import { useState } from "react";
import { BottomSheet } from "@/app/_components/ui/BottomSheet";
import { useLocale } from "@/lib/i18n";

export type CrewRegionOption = {
  value: string;
  label: string;
};

function ChevronDown() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="m5 7 5 6 5-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

export function CrewRegionPickerSheet({
  title,
  value,
  options,
  onSelect,
  onClose,
}: {
  title: string;
  value: string;
  options: CrewRegionOption[];
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const { t } = useLocale();

  return (
    <BottomSheet
      onClose={onClose}
      zIndexClass="z-[110]"
      panelClassName="flex max-h-[72vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
    >
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
      <ul role="listbox" className="overflow-y-auto py-2">
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

export function CrewRegionPicker({
  value,
  options,
  placeholder,
  title,
  onChange,
  disabled = false,
}: {
  value: string;
  options: CrewRegionOption[];
  placeholder: string;
  title: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between rounded-lg border border-zinc-300 bg-white px-3 py-2 text-left text-sm disabled:opacity-50"
      >
        <span className={selected ? "text-zinc-900" : "text-zinc-400"}>
          {selected?.label ?? placeholder}
        </span>
        <span className="text-zinc-400">
          <ChevronDown />
        </span>
      </button>
      {open ? (
        <CrewRegionPickerSheet
          title={title}
          value={value}
          options={options}
          onSelect={onChange}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
