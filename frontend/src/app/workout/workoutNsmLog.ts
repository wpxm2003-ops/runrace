import type { NsmSessionLogBody } from "@/lib/api/types";
import type { NsmSession } from "@/lib/nsm";
import { loadNsmProgress } from "@/lib/nsmSessionProgress";

/** 종료 순간의 sub-T 진행 상태를 영속화할 API 페이로드로 고정한다. */
export function buildNsmLog(session: NsmSession | null): NsmSessionLogBody | null {
  if (!session?.isSubT) return null;
  const reps = session.reps ?? 0;
  const progress = loadNsmProgress();
  const started = progress?.started === true;
  const done = started && progress?.phase === "done";
  return {
    workoutId: null,
    day: session.day,
    kind: session.kind as "SHORT" | "MEDIUM" | "LONG",
    targetPaceSec: session.targetPaceSec ?? null,
    repsPlanned: session.reps ?? null,
    repsDone: done ? reps : started ? (progress?.repIndex ?? 0) : 0,
    completed: done,
  };
}
