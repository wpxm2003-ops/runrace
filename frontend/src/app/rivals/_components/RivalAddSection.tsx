"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { Card } from "@/app/_components/ui/Card";
import { TextInput } from "@/app/_components/ui/TextInput";
import { addRival, useRivals, toDisplayError, mapErrorMessage, reportClientError } from "@/lib/api";
import { stripForbiddenText } from "@/lib/forbiddenTextChars";
import { handleAuthFailure } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import { toast } from "sonner";

/** 라이벌 추가 — 닉네임으로 검색해 등록한다. */
export function RivalAddSection({ user }: { user: User }) {
  const { t } = useLocale();
  const { mutate: mutateRivals } = useRivals(user);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function mapAddError(e: unknown): string {
    return mapErrorMessage(
      e,
      [
        { codes: ["user_not_found"], message: t.rival_error_not_found },
        { codes: ["cannot_add_self"], message: t.rival_error_self },
        { codes: ["already_rival"], message: t.rival_error_already },
      ],
      () => toDisplayError(e) ?? t.error_occurred,
    );
  }

  async function onAdd() {
    const nickname = draft.trim();
    if (!nickname || adding) return;
    setAdding(true);
    setActionError(null);
    try {
      await addRival(nickname, user);
      void track("rival_added");
      void mutateRivals();
      setDraft("");
      toast.success(t.toast_rival_added);
    } catch (e) {
      void reportClientError({
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? (e.stack ?? null) : null,
        kind: "action",
      });
      if (!handleAuthFailure(e, "/rivals")) setActionError(mapAddError(e));
    } finally {
      setAdding(false);
    }
  }

  return (
    <Card className="mt-4">
      <div className="text-base font-semibold">{t.rival_add_heading}</div>
      <div className="mt-3 flex gap-2">
        <TextInput
          type="text"
          value={draft}
          onChange={(e) => setDraft(stripForbiddenText(e.target.value).slice(0, 20))}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAdd();
          }}
          placeholder={t.rival_add_placeholder}
          maxLength={20}
          className="min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={adding || !draft.trim()}
          className="shrink-0 rounded-lg bg-zinc-900 px-4 text-sm text-white disabled:opacity-50"
        >
          {adding ? t.rival_adding : t.rival_add_button}
        </button>
      </div>
      {actionError ? <p className="mt-2 text-xs text-red-600">{actionError}</p> : null}
    </Card>
  );
}
