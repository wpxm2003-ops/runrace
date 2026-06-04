"use client";

import { PageLayout } from "@/app/_components/PageLayout";
import { Alert } from "@/app/_components/ui/Alert";
import { Card } from "@/app/_components/ui/Card";
import { fetchChallengeDetail, updateChallenge } from "@/lib/api";
import { challengeDetailHref, challengeEditHref, parseChallengeId } from "@/lib/challengeRoute";
import { clampMaxMembers, sanitizeDigits } from "@/lib/challengeForm";
import { toDateInputValue } from "@/lib/format";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useLocale } from "@/lib/i18n";
import { nativeNavigate } from "@/lib/nativeNav";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function ChallengeEditContent() {
  const params = useParams();
  const id = useMemo(() => parseChallengeId(String(params?.id ?? "")), [params?.id]);
  const { user } = useRequireAuth(id ? challengeEditHref(id) : undefined);
  const { t } = useLocale();

  const [title, setTitle] = useState("");
  const [goalKm, setGoalKm] = useState("");
  const [maxMembers, setMaxMembers] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [memberCount, setMemberCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) { setError(t.detail_no_id); return; }
    if (!user) return;
    fetchChallengeDetail(id, user)
      .then((d) => {
        if (!d.showManage) { nativeNavigate(challengeDetailHref(id)); return; }
        setTitle(d.title);
        setGoalKm(String(d.goalKm));
        setMaxMembers(String(d.maxMembers));
        setStartDate(toDateInputValue(d.startAt));
        setEndDate(d.endAt ? toDateInputValue(d.endAt) : "");
        setMemberCount(d.memberCount);
      })
      .catch((e) => setError(String(e)));
  }, [id, user, t.detail_no_id]);

  async function onSubmit() {
    if (!user || !id) return;
    setError(null);
    setSubmitting(true);
    try {
      const goal = parseInt(goalKm, 10);
      const max = parseInt(maxMembers, 10);
      if (!title.trim()) throw new Error(t.edit_err_title);
      if (!goal || goal < 1) throw new Error(t.edit_err_goal);
      if (!max || max < memberCount || max > 50) throw new Error(t.edit_err_members(memberCount));
      if (endDate < startDate) throw new Error(t.edit_err_date);
      await updateChallenge(id, { title: title.trim(), goalKm: goal, maxMembers: max, startDate, endDate }, user);
      nativeNavigate(challengeDetailHref(id));
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageLayout title={t.edit_title}>
      {error ? <Alert className="mb-4">{error}</Alert> : null}
      <Card>
        <label className="block text-sm font-medium">{t.edit_field_title}</label>
        <input className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3" value={title} onChange={(e) => setTitle(e.target.value)} />

        <label className="mt-4 block text-sm font-medium">{t.edit_field_goal}</label>
        <input className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3" inputMode="numeric" value={goalKm} onChange={(e) => setGoalKm(sanitizeDigits(e.target.value))} />

        <label className="mt-4 block text-sm font-medium">{t.edit_field_members}</label>
        <input className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3" inputMode="numeric" value={maxMembers} onChange={(e) => setMaxMembers(clampMaxMembers(e.target.value))} />

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium">{t.edit_field_start}</label>
            <input type="date" className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium">{t.edit_field_end}</label>
            <input type="date" className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <button type="button" disabled={submitting} onClick={onSubmit}
          className="mt-6 h-11 w-full rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-300">
          {submitting ? t.edit_btn_busy : t.edit_btn}
        </button>
      </Card>
    </PageLayout>
  );
}
