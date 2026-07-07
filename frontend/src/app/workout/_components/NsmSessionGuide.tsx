"use client";

import { useEffect, useState } from "react";
import type { NsmSession } from "@/lib/nsm";
import { formatPaceSec } from "@/lib/nsm";
import { loadNsmProgress, saveNsmProgress, type NsmProgress } from "@/lib/nsmSessionProgress";
import { useLocale } from "@/lib/i18n";

function repTargetMeters(session: NsmSession): number | null {
  return session.repUnit === "km" ? (session.repAmount ?? 0) * 1000 : null;
}

function repTargetSeconds(session: NsmSession): number | null {
  return session.repUnit === "min" ? (session.repAmount ?? 0) * 60 : null;
}

const INITIAL: NsmProgress = {
  sessionKey: "",
  started: false,
  repIndex: 0,
  phase: "work",
  baseDist: 0,
  baseSec: 0,
  restEnd: 0,
};

function localDayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function sessionKeyOf(session: NsmSession): string {
  return [
    localDayKey(),
    session.day,
    session.kind,
    session.reps ?? "",
    session.repAmount ?? "",
    session.repUnit ?? "",
    session.restSec ?? "",
    session.targetPaceSec ?? "",
  ].join("|");
}

export function NsmSessionGuide({
  session,
  distanceM,
  elapsedSec,
}: {
  session: NsmSession;
  distanceM: number;
  elapsedSec: number;
}) {
  const { t } = useLocale();
  const reps = session.reps ?? 1;
  const targetM = repTargetMeters(session);
  const targetSec = repTargetSeconds(session);
  const targetPace = session.targetPaceSec ?? 0;
  const restSec = session.restSec ?? 0;
  const sessionKey = sessionKeyOf(session);

  const [prog, setProg] = useState<NsmProgress>(() => {
    const saved = loadNsmProgress();
    return saved?.sessionKey === sessionKey ? saved : { ...INITIAL, sessionKey };
  });

  useEffect(() => {
    saveNsmProgress(prog);
  }, [prog]);

  useEffect(() => {
    setProg((prev) => (prev.sessionKey === sessionKey ? prev : { ...INITIAL, sessionKey }));
  }, [sessionKey]);

  useEffect(() => {
    if (!prog.started || prog.phase === "done") return;

    // A new run restarted from zero or a different session key was mounted.
    if (distanceM + 1 < prog.baseDist) {
      setProg({ ...INITIAL, sessionKey });
      return;
    }

    if (prog.phase === "work") {
      const workDone =
        targetM != null
          ? distanceM - prog.baseDist >= targetM
          : targetSec != null
            ? elapsedSec - prog.baseSec >= targetSec
            : false;

      if (workDone) {
        if (prog.repIndex + 1 >= reps) {
          setProg({ ...prog, phase: "done" });
        } else {
          setProg({ ...prog, phase: "rest", restEnd: elapsedSec + restSec });
        }
      }
      return;
    }

    if (elapsedSec >= prog.restEnd) {
      setProg({
        ...prog,
        repIndex: prog.repIndex + 1,
        phase: "work",
        baseDist: distanceM,
        baseSec: elapsedSec,
      });
    }
  }, [distanceM, elapsedSec, prog, reps, restSec, sessionKey, targetM, targetSec]);

  function startRep() {
    setProg({
      sessionKey,
      started: true,
      repIndex: 0,
      phase: "work",
      baseDist: distanceM,
      baseSec: elapsedSec,
      restEnd: 0,
    });
  }

  if (!prog.started) {
    return (
      <div className="mb-3 rounded-xl border border-zinc-900 bg-zinc-900 p-3 text-white">
        <div className="text-xs text-zinc-400">{t.nsm_guide_label}</div>
        <div className="mt-0.5 text-sm font-semibold">
          {session.reps}횟 {session.repAmount}
          {session.repUnit} × {t.nsm_session_sub(formatPaceSec(targetPace), restSec)}
        </div>
        <button
          type="button"
          onClick={startRep}
          className="mt-2 w-full rounded-lg bg-white py-2 text-sm font-semibold text-zinc-900"
        >
          {t.nsm_guide_start}
        </button>
      </div>
    );
  }

  if (prog.phase === "done") {
    return (
      <div className="mb-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-emerald-900">
        <div className="text-sm font-semibold">{t.nsm_done(reps)}</div>
        <div className="mt-0.5 text-xs text-emerald-700">{t.nsm_guide_done_sub}</div>
      </div>
    );
  }

  if (prog.phase === "rest") {
    const remaining = Math.max(0, Math.ceil(prog.restEnd - elapsedSec));
    return (
      <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{t.nsm_rest}</span>
          <span className="text-2xl font-bold tabular-nums">{t.nsm_remain_sec(remaining)}</span>
        </div>
        <div className="mt-0.5 text-xs text-amber-700">{t.nsm_rest_next(prog.repIndex + 2, reps)}</div>
      </div>
    );
  }

  const coveredM = distanceM - prog.baseDist;
  const workedSec = elapsedSec - prog.baseSec;
  const repPace = coveredM > 50 ? Math.round(workedSec / (coveredM / 1000)) : null;

  let progressLabel: string;
  if (targetM != null) {
    const remainM = Math.max(0, targetM - coveredM);
    progressLabel =
      remainM >= 1000
        ? t.nsm_remain_km((remainM / 1000).toFixed(2))
        : t.nsm_remain_m(Math.round(remainM));
  } else {
    const remainS = Math.max(0, (targetSec ?? 0) - workedSec);
    progressLabel = t.nsm_remain_sec(Math.ceil(remainS));
  }

  let cue: { text: string; cls: string };
  if (repPace == null) {
    cue = { text: t.nsm_cue_measuring, cls: "text-zinc-500" };
  } else if (repPace < targetPace - 6) {
    cue = { text: t.nsm_cue_too_fast, cls: "text-red-600" };
  } else if (repPace > targetPace + 6) {
    cue = { text: t.nsm_cue_slow, cls: "text-amber-700" };
  } else {
    cue = { text: t.nsm_cue_ok, cls: "text-emerald-700" };
  }

  return (
    <div className="mb-3 rounded-xl border border-zinc-900 bg-zinc-900 p-3 text-white">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">
          {t.nsm_rep} {prog.repIndex + 1}/{reps}
        </span>
        <span className="text-xs text-zinc-400">{progressLabel}</span>
      </div>
      <div className="mt-1.5 flex items-end justify-between">
        <div>
          <div className="text-[11px] text-zinc-400">{t.nsm_target}</div>
          <div className="text-lg font-bold tabular-nums">{formatPaceSec(targetPace)}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-zinc-400">{t.nsm_current_rep}</div>
          <div className="text-lg font-bold tabular-nums">
            {repPace != null ? formatPaceSec(repPace) : "-"}
          </div>
        </div>
      </div>
      <div className="mt-1 text-xs font-medium">
        <span className={`rounded bg-white px-1.5 py-0.5 ${cue.cls}`}>{cue.text}</span>
      </div>
    </div>
  );
}
