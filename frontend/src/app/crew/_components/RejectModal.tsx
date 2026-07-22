"use client";

import { useState } from "react";
import { BottomSheet } from "@/app/_components/ui/BottomSheet";
import { TextArea } from "@/app/_components/ui/TextInput";
import { stripForbiddenText } from "@/lib/forbiddenTextChars";
import { useLocale } from "@/lib/i18n";

/** 거절 사유 입력 모달(선택) — 신청자에게 앱 푸시로 함께 전달된다. */
export function RejectModal({
  onClose,
  onSubmit,
  submitting,
}: {
  onClose: () => void;
  onSubmit: (reason: string) => void;
  submitting: boolean;
}) {
  const { t } = useLocale();
  const [reason, setReason] = useState("");

  return (
    <BottomSheet onClose={onClose} panelClassName="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-900">{t.crew_inbox_reject_modal_title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.cancel}
          className="-mr-1 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100"
        >
          ✕
        </button>
      </div>
      <TextArea
        value={reason}
        onChange={(e) => setReason(stripForbiddenText(e.target.value).slice(0, 100))}
        placeholder={t.crew_inbox_reject_reason_placeholder}
        maxLength={100}
        rows={3}
        className="mt-4 w-full"
      />
      <button
        type="button"
        disabled={submitting}
        onClick={() => onSubmit(reason.trim())}
        className="mt-4 h-11 w-full rounded-xl bg-zinc-900 text-sm text-white disabled:opacity-50"
      >
        {submitting ? t.crew_detail_apply_busy : t.crew_inbox_reject_submit_btn}
      </button>
    </BottomSheet>
  );
}
