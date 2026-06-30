"use client";

// NSM 런 중 세션 가이드(B-2) — 라이브 distanceM/elapsedSec로 렙 진행을 추적.
// 거리 렙(1km·3km): 거리 도달로 완료 / 시간 렙(6min): 시간 도달로 완료. 휴식은 타이머.
// 렙 진행상태는 localStorage에 영속화 — 탭 이탈/리마운트로 0렙 리셋 방지.

import { useEffect, useState } from "react";
import type { NsmSession } from "@/lib/nsm";
import { formatPaceSec } from "@/lib/nsm";
import { loadNsmProgress, saveNsmProgress, type NsmProgress } from "@/lib/nsmSessionProgress";

function repTargetMeters(s: NsmSession): number | null {
  return s.repUnit === "km" ? (s.repAmount ?? 0) * 1000 : null;
}
function repTargetSeconds(s: NsmSession): number | null {
  return s.repUnit === "min" ? (s.repAmount ?? 0) * 60 : null;
}

const INITIAL: NsmProgress = {
  started: false,
  repIndex: 0,
  phase: "work",
  baseDist: 0,
  baseSec: 0,
  restEnd: 0,
};

export function NsmSessionGuide({
  session,
  distanceM,
  elapsedSec,
}: {
  session: NsmSession;
  distanceM: number;
  elapsedSec: number;
}) {
  const reps = session.reps ?? 1;
  const targetM = repTargetMeters(session);
  const targetSec = repTargetSeconds(session);
  const targetPace = session.targetPaceSec ?? 0;
  const restSec = session.restSec ?? 0;

  // 리마운트 시 진행상태 복원.
  const [prog, setProg] = useState<NsmProgress>(() => loadNsmProgress() ?? INITIAL);

  useEffect(() => {
    saveNsmProgress(prog);
  }, [prog]);

  // 라이브 값 변화에 따라 상태기계 진행.
  useEffect(() => {
    if (!prog.started || prog.phase === "done") return;

    // 다른(새) 런이면(거리가 baseline보다 작음) 진행상태 폐기.
    if (distanceM + 1 < prog.baseDist) {
      setProg(INITIAL);
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
    } else if (prog.phase === "rest") {
      if (elapsedSec >= prog.restEnd) {
        setProg({
          ...prog,
          repIndex: prog.repIndex + 1,
          phase: "work",
          baseDist: distanceM,
          baseSec: elapsedSec,
        });
      }
    }
  }, [distanceM, elapsedSec, prog, reps, targetM, targetSec, restSec]);

  function startRep() {
    setProg({ started: true, repIndex: 0, phase: "work", baseDist: distanceM, baseSec: elapsedSec, restEnd: 0 });
  }

  // ── 시작 전 ──
  if (!prog.started) {
    return (
      <div className="mb-3 rounded-xl border border-zinc-900 bg-zinc-900 p-3 text-white">
        <div className="text-xs text-zinc-400">NSM 세션</div>
        <div className="mt-0.5 text-sm font-semibold">
          {session.reps} × {session.repAmount}
          {session.repUnit} · 목표 {formatPaceSec(targetPace)}/km · 휴식 {restSec}초
        </div>
        <button
          type="button"
          onClick={startRep}
          className="mt-2 w-full rounded-lg bg-white py-2 text-sm font-semibold text-zinc-900"
        >
          워밍업 끝났으면 · 1번째 렙 시작
        </button>
      </div>
    );
  }

  // ── 완료 ──
  if (prog.phase === "done") {
    return (
      <div className="mb-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-emerald-900">
        <div className="text-sm font-semibold">세션 완료! 🎉 {reps}렙 끝</div>
        <div className="mt-0.5 text-xs text-emerald-700">마무리 조깅 후 종료를 눌러 저장하세요.</div>
      </div>
    );
  }

  // ── 휴식 ──
  if (prog.phase === "rest") {
    const remaining = Math.max(0, Math.ceil(prog.restEnd - elapsedSec));
    return (
      <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">휴식</span>
          <span className="text-2xl font-bold tabular-nums">{remaining}초</span>
        </div>
        <div className="mt-0.5 text-xs text-amber-700">
          다음 {prog.repIndex + 2}/{reps}번째 렙 준비
        </div>
      </div>
    );
  }

  // ── 진행 중(work) ──
  const coveredM = distanceM - prog.baseDist;
  const workedSec = elapsedSec - prog.baseSec;
  const repPace = coveredM > 50 ? Math.round(workedSec / (coveredM / 1000)) : null;

  let progressLabel: string;
  if (targetM != null) {
    const remainM = Math.max(0, targetM - coveredM);
    progressLabel = remainM >= 1000 ? `${(remainM / 1000).toFixed(2)}km 남음` : `${Math.round(remainM)}m 남음`;
  } else {
    const remainS = Math.max(0, (targetSec ?? 0) - workedSec);
    progressLabel = `${Math.ceil(remainS)}초 남음`;
  }

  // NSM은 sub-T 초과(너무 빠름)를 경계. 목표 대비 ±6초/km 허용.
  // 데이터가 모이기 전(50m 미만)엔 긍정 단정 대신 중립 표시.
  let cue: { text: string; cls: string };
  if (repPace == null) {
    cue = { text: "페이스 측정 중…", cls: "text-zinc-500" };
  } else if (repPace < targetPace - 6) {
    cue = { text: "⚠️ 너무 빨라요 — Sub-T 유지", cls: "text-red-600" };
  } else if (repPace > targetPace + 6) {
    cue = { text: "🔻 조금 느려요", cls: "text-amber-700" };
  } else {
    cue = { text: "✅ 적정 페이스", cls: "text-emerald-700" };
  }

  return (
    <div className="mb-3 rounded-xl border border-zinc-900 bg-zinc-900 p-3 text-white">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">
          렙 {prog.repIndex + 1}/{reps}
        </span>
        <span className="text-xs text-zinc-400">{progressLabel}</span>
      </div>
      <div className="mt-1.5 flex items-end justify-between">
        <div>
          <div className="text-[11px] text-zinc-400">목표</div>
          <div className="text-lg font-bold tabular-nums">{formatPaceSec(targetPace)}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-zinc-400">현재 렙</div>
          <div className="text-lg font-bold tabular-nums">{repPace != null ? formatPaceSec(repPace) : "—"}</div>
        </div>
      </div>
      <div className="mt-1 text-xs font-medium">
        <span className={`rounded bg-white px-1.5 py-0.5 ${cue.cls}`}>{cue.text}</span>
      </div>
    </div>
  );
}
