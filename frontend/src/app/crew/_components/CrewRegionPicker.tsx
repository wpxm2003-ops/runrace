"use client";

import { useState } from "react";
import { SelectSheet } from "@/app/_components/ui/SelectSheet";

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
  return (
    <SelectSheet
      title={title}
      value={value}
      options={options}
      onSelect={onSelect}
      onClose={onClose}
      zIndexClass="z-[110]"
      panelClassName="flex max-h-[72vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
    />
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
