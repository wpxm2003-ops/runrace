"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { LoadingCard } from "@/app/_components/ui/LoadingCard";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import { addRival, removeRival, useRivals, toDisplayError, reportClientError, reportAndDisplay } from "@/lib/api";
import type { RivalRow } from "@/lib/api/types";
import { stripForbiddenText } from "@/lib/forbiddenTextChars";
import { handleAuthFailure } from "@/lib/auth";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { toast } from "sonner";

function winRate(wins: number, losses: number): string | null {
  const games = wins + losses;
  if (games === 0) return null;
  const pct = (wins / games) * 100;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(0);
}

function RivalListRow({
  rival,
  onRemove,
  removing,
}: {
  rival: RivalRow;
  onRemove: (id: string) => void;
  removing: boolean;
}) {
  const { t } = useLocale();
  const rate = winRate(rival.wins, rival.losses);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-100 p-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-zinc-900">
          {rival.nickname ?? t.no_name}
        </div>
        <div className="mt-0.5 text-[11px] text-zinc-500">
          {t.head_to_head_record(rival.wins, rival.losses)}
          {rate != null ? ` · ${t.rival_winrate(rate)}` : ""}
        </div>
      </div>
      <button
        type="button"
        disabled={removing}
        onClick={() => onRemove(rival.rivalUserId)}
        className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
      >
        {t.rival_remove}
      </button>
    </div>
  );
}

function RivalsContent({ user }: { user: User }) {
  const { t } = useLocale();
  const { data: rivals, isLoading, error, mutate: mutateRivals } = useRivals(user);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  function mapAddError(e: unknown): string {
    const msg = String(e);
    if (msg.includes("user_not_found")) return t.rival_error_not_found;
    if (msg.includes("cannot_add_self")) return t.rival_error_self;
    if (msg.includes("already_rival")) return t.rival_error_already;
    return toDisplayError(e) ?? t.error_occurred;
  }

  async function onAdd() {
    const nickname = draft.trim();
    if (!nickname || adding) return;
    setAdding(true);
    setActionError(null);
    try {
      await addRival(nickname, user);
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

  async function onRemove(rivalUserId: string) {
    setRemovingId(rivalUserId);
    setActionError(null);
    try {
      await removeRival(rivalUserId, user);
      void mutateRivals();
      toast.success(t.toast_rival_removed);
    } catch (e) {
      if (!handleAuthFailure(e, "/rivals")) setActionError(reportAndDisplay(e));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <PageLayout title={t.rival_manage}>
      <Card>
        <button
          type="button"
          onClick={() => setPreviewOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-sm text-zinc-600">{t.rival_description_toggle}</span>
          <span className="ml-2 shrink-0 text-sm text-zinc-400">{previewOpen ? "▲" : "▼"}</span>
        </button>
        {previewOpen && (
          <div className="mt-3">
            <div className="flex flex-col gap-2">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-500">1</span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-amber-900">씩씩한여우6720</span>
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">{t.rival_label}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] font-medium text-amber-700">3승 2패</div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold text-zinc-900">62%</div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">24.80 / 40.00 km</div>
                  </div>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-full w-[62%] rounded-full bg-zinc-900" />
                </div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-500">2</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-emerald-900">느린곰5495</span>
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">{t.me_label}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold text-emerald-700">45%</div>
                    <div className="mt-0.5 text-[11px] text-emerald-700">18.00 / 40.00 km</div>
                  </div>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-full w-[45%] rounded-full bg-emerald-600" />
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs font-medium text-zinc-400">{t.rival_preview_hint}</p>
            <p className="mt-3 text-xs font-medium text-zinc-400">{t.rival_guide}</p>
            <p className="mt-1 text-xs text-zinc-400">{t.rival_follow_notice}</p>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <div className="text-base font-semibold">{t.rival_add_heading}</div>
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(stripForbiddenText(e.target.value).slice(0, 20))}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAdd();
            }}
            placeholder={t.rival_add_placeholder}
            maxLength={20}
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
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

      <Card className="mt-4">
        <div className="text-base font-semibold">{t.rival_list_heading}</div>
        {error ? <Alert className="mt-3">{toDisplayError(error)}</Alert> : null}
        <div className="mt-3">
          {isLoading && !rivals ? (
            <SkeletonLines count={2} />
          ) : !rivals || rivals.length === 0 ? (
            <div className="text-sm text-zinc-600">{t.rival_empty}</div>
          ) : (
            <div className="flex flex-col gap-2">
              {rivals.map((r) => (
                <RivalListRow
                  key={r.rivalUserId}
                  rival={r}
                  onRemove={onRemove}
                  removing={removingId === r.rivalUserId}
                />
              ))}
            </div>
          )}
        </div>
      </Card>
    </PageLayout>
  );
}

export default function RivalsPage() {
  const { user, loading } = useRequireAuth("/rivals");
  const { t } = useLocale();

  if (loading || !user) {
    return (
      <PageLayout title={t.rival_manage}>
        <LoadingCard />
      </PageLayout>
    );
  }

  return <RivalsContent user={user} />;
}
