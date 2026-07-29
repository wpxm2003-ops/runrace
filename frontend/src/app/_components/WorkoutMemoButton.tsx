"use client";

import { useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { Button } from "@/app/_components/ui/Button";
import { BottomSheet } from "@/app/_components/ui/BottomSheet";
import { WorkoutMemoEditor } from "@/app/_components/WorkoutMemoEditor";
import { useLocale } from "@/lib/i18n";

/** 헤더 액션 아이콘 — 클릭하면 메모 편집 바텀시트를 연다(WorkoutPhotoButton과 대칭 구조). */
export function WorkoutMemoButton({
  workoutId,
  initialMemo,
  user,
  className = "",
  children,
  ariaLabel,
}: {
  workoutId: number;
  initialMemo: string | null | undefined;
  user: User;
  className?: string;
  children?: ReactNode;
  ariaLabel?: string;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [memo, setMemo] = useState(initialMemo ?? "");

  function handleDone(savedMemo?: string) {
    if (savedMemo !== undefined) setMemo(savedMemo);
    setOpen(false);
  }

  const label = ariaLabel ?? t.memo_btn;

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        className={className}
        aria-label={label}
        title={label}
      >
        {children ?? t.memo_btn}
      </Button>

      {open ? (
        <BottomSheet onClose={() => setOpen(false)} panelClassName="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
          <div className="mb-3 text-sm font-semibold text-zinc-900">{t.memo_btn}</div>
          <WorkoutMemoEditor
            workoutId={workoutId}
            initialMemo={memo}
            user={user}
            onDone={handleDone}
          />
        </BottomSheet>
      ) : null}
    </>
  );
}
