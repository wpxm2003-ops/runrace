"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { Card } from "@/app/_components/ui/Card";
import { updateWorkoutShoe, useShoes, invalidateWorkoutDetail } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import { toast } from "sonner";

/** 운동 상세 — 이 러닝에 귀속된 신발을 사후에 변경/해제한다. */
export function WorkoutShoeSelector({
  workoutId,
  initialShoeId,
  user,
}: {
  workoutId: number;
  initialShoeId: number | null;
  user: User;
}) {
  const { t } = useLocale();
  const { data: shoes } = useShoes(user);
  const [shoeId, setShoeId] = useState<number | null>(initialShoeId);
  const [saving, setSaving] = useState(false);

  // 등록한 신발이 없으면 굳이 노출하지 않는다.
  if (!shoes || shoes.length === 0) return null;

  async function onChange(next: number | null) {
    if (saving || next === shoeId) return;
    const prev = shoeId;
    setShoeId(next);
    setSaving(true);
    try {
      await updateWorkoutShoe(workoutId, next, user);
      invalidateWorkoutDetail(workoutId, user.uid);
      toast.success(t.shoe_toast_workout_shoe);
    } catch {
      setShoeId(prev); // 실패 시 되돌림
      toast.error(t.error_occurred);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <span aria-hidden>👟</span>
          {t.shoe_detail_label}
        </span>
        <select
          value={shoeId ?? ""}
          disabled={saving}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          className="min-w-0 max-w-[60%] truncate rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none disabled:opacity-50"
        >
          <option value="">{t.shoe_detail_none}</option>
          {shoes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nickname?.trim() || `${s.brand} ${s.model}`}
            </option>
          ))}
        </select>
      </div>
    </Card>
  );
}
