"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { LoadingCard } from "@/app/_components/ui/LoadingCard";
import { SkeletonLines } from "@/app/_components/ui/Skeleton";
import {
  activateShoe,
  createShoe,
  deleteShoe,
  updateShoe,
  useShoes,
  toDisplayError,
  reportAndDisplay,
} from "@/lib/api";
import type { ShoeFormBody, ShoeRow } from "@/lib/api/types";
import { handleAuthFailure } from "@/lib/auth";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { useUnit } from "@/lib/UnitContext";
import { formatDistance, formatDistanceInt, formatDistanceAmountInt } from "@/lib/units";
import { useConfirm } from "@/app/_components/ConfirmProvider";
import { ShoeFormSheet } from "./_components/ShoeFormSheet";
import { toast } from "sonner";

/** 신발 한 줄 — 누적 거리 + 교체 목표 진행률 + 활성/수정/삭제. */
function ShoeListRow({
  shoe,
  onActivate,
  onEdit,
  onDelete,
  busy,
}: {
  shoe: ShoeRow;
  onActivate: (id: number) => void;
  onEdit: (shoe: ShoeRow) => void;
  onDelete: (id: number) => void;
  busy: boolean;
}) {
  const { t } = useLocale();
  const { unit } = useUnit();
  const title = shoe.nickname?.trim() || `${shoe.brand} ${shoe.model}`;
  const hasTarget = shoe.targetDistanceM != null && shoe.targetDistanceM > 0;
  const pct = hasTarget
    ? Math.min(100, Math.round((shoe.totalDistanceM / shoe.targetDistanceM!) * 100))
    : null;

  return (
    <div
      className={`rounded-xl border p-3 ${
        shoe.active ? "border-zinc-900 bg-zinc-50" : "border-zinc-100"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span aria-hidden className="text-2xl leading-none">👟</span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-zinc-900">{title}</span>
              {shoe.active ? (
                <span className="shrink-0 rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {t.shoe_active_badge}
                </span>
              ) : null}
            </div>
            {shoe.nickname?.trim() ? (
              <div className="mt-0.5 truncate text-[11px] text-zinc-500">
                {shoe.brand} {shoe.model}
              </div>
            ) : null}
            <div className="mt-1 text-[11px] font-medium text-zinc-600">
              {t.shoe_mileage_label} {formatDistance(shoe.totalDistanceM, unit)}
            </div>
          </div>
        </div>
        {!shoe.active ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onActivate(shoe.id)}
            className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
          >
            {t.shoe_activate_action}
          </button>
        ) : null}
      </div>

      <div className="mt-2.5">
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
          {hasTarget ? (
            <div
              className={`h-full rounded-full ${pct! >= 100 ? "bg-red-500" : "bg-emerald-500"}`}
              style={{ width: `${pct}%` }}
            />
          ) : (
            <div className="h-full w-full rounded-full bg-gradient-to-r from-emerald-300 to-sky-400" />
          )}
        </div>
        <div className="mt-1 text-right text-[11px] text-zinc-400">
          {hasTarget
            ? `${formatDistanceAmountInt(shoe.totalDistanceM / 1000, unit)} / ${formatDistanceInt(shoe.targetDistanceM!, unit)} (${pct}%)`
            : `${formatDistanceInt(shoe.totalDistanceM, unit)} · ${t.shoe_unlimited}`}
        </div>
      </div>

      <div className="mt-2 flex justify-end gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onEdit(shoe)}
          className="text-xs text-zinc-500 hover:underline disabled:opacity-50"
        >
          {t.shoe_edit_action}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDelete(shoe.id)}
          className="text-xs text-red-500 hover:underline disabled:opacity-50"
        >
          {t.shoe_delete_action}
        </button>
      </div>
    </div>
  );
}

function ShoesContent({ user }: { user: User }) {
  const { t } = useLocale();
  const { unit } = useUnit();
  const confirm = useConfirm();
  const { data: shoes, isLoading, error, mutate } = useShoes(user);

  // 모달 상태 — editingShoe=null이면 신규 등록, 값이 있으면 수정.
  const [formOpen, setFormOpen] = useState(false);
  const [editingShoe, setEditingShoe] = useState<ShoeRow | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function openCreate() {
    setEditingShoe(null);
    setFormOpen(true);
  }

  function openEdit(shoe: ShoeRow) {
    setEditingShoe(shoe);
    setFormOpen(true);
  }

  /** 모달 저장 — 생성/수정 + 캐시 갱신 + 토스트. 실패 시 throw(모달이 에러 표시). */
  async function handleSave(body: ShoeFormBody) {
    if (editingShoe) {
      await updateShoe(editingShoe.id, body, user);
      await mutate();
      toast.success(t.shoe_toast_updated);
    } else {
      const created = await createShoe(body, user);
      // 새 신발을 즉시 목록 맨 앞에 반영 후 서버 값으로 재검증.
      await mutate((cur) => [created, ...(cur ?? [])], { revalidate: true });
      toast.success(t.shoe_toast_added);
    }
  }

  async function onActivate(id: number) {
    setBusyId(id);
    setActionError(null);
    try {
      await activateShoe(id, user);
      await mutate();
      toast.success(t.shoe_toast_activated);
    } catch (e) {
      if (!handleAuthFailure(e, "/shoes")) setActionError(reportAndDisplay(e));
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(id: number) {
    const ok = await confirm({
      title: t.shoe_delete_confirm_title,
      message: t.shoe_delete_confirm_msg,
      confirmLabel: t.shoe_delete_action,
      cancelLabel: t.cancel,
      destructive: true,
    });
    if (!ok) return;
    setBusyId(id);
    setActionError(null);
    try {
      await deleteShoe(id, user);
      await mutate();
      toast.success(t.shoe_toast_deleted);
    } catch (e) {
      if (!handleAuthFailure(e, "/shoes")) setActionError(reportAndDisplay(e));
    } finally {
      setBusyId(null);
    }
  }

  const addButton = (
    <button
      type="button"
      onClick={openCreate}
      className="rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-800"
    >
      {t.shoe_add_button}
    </button>
  );

  return (
    <PageLayout title={t.shoe_title} actions={addButton}>
      <Card>
        <p className="text-xs leading-relaxed text-zinc-500">{t.shoe_intro}</p>
      </Card>

      <Card className="mt-4">
        <div className="text-base font-semibold">{t.shoe_list_heading}</div>
        {error ? <Alert className="mt-3">{toDisplayError(error)}</Alert> : null}
        {actionError ? <Alert className="mt-3">{actionError}</Alert> : null}
        <div className="mt-3">
          {isLoading && !shoes ? (
            <SkeletonLines count={2} />
          ) : !shoes || shoes.length === 0 ? (
            <div className="text-sm text-zinc-600">{t.shoe_empty}</div>
          ) : (
            <div className="flex flex-col gap-2">
              {shoes.map((s) => (
                <ShoeListRow
                  key={s.id}
                  shoe={s}
                  onActivate={onActivate}
                  onEdit={openEdit}
                  onDelete={onDelete}
                  busy={busyId === s.id}
                />
              ))}
            </div>
          )}
        </div>
      </Card>

      {formOpen ? (
        <ShoeFormSheet
          key={editingShoe?.id ?? "new"}
          shoe={editingShoe}
          unit={unit}
          onSave={handleSave}
          onClose={() => setFormOpen(false)}
        />
      ) : null}
    </PageLayout>
  );
}

export default function ShoesPage() {
  const { user, loading } = useRequireAuth("/shoes");
  const { t } = useLocale();

  if (loading || !user) {
    return (
      <PageLayout title={t.shoe_title}>
        <LoadingCard />
      </PageLayout>
    );
  }

  return <ShoesContent user={user} />;
}
