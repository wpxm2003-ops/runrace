"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { GhostSelection } from "@/app/workout/_components/GhostPicker";
import { fetchWorkout } from "@/lib/api";
import { track } from "@/lib/analytics";
import {
  ensureGhostTimestamps,
  ghostDistanceAtElapsed,
  ghostTotalDurationMs,
} from "@/lib/ghostRace";
import type { DistanceUnit } from "@/lib/units";
import { formatDistance } from "@/lib/units";
import type { WorkoutSessionValue } from "@/lib/WorkoutSessionProvider";
import {
  clearGhostSelection,
  loadGhostSelection,
  saveGhostSelection,
} from "@/lib/workoutPersistence";

export function useWorkoutGhostRace(
  user: User | null,
  unit: DistanceUnit,
  session: WorkoutSessionValue,
) {
  const [selection, setSelection] = useState<{
    ownerUid: string;
    ghost: GhostSelection;
  } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectionVersionRef = useRef(0);
  const ghost = useMemo(() => {
    if (!selection || selection.ownerUid !== user?.uid) return null;
    return { ...selection.ghost, label: formatDistance(selection.ghost.distanceM, unit) };
  }, [selection, unit, user?.uid]);

  useEffect(() => {
    if (!user) return;
    const savedId = loadGhostSelection();
    if (savedId == null) return;
    const version = selectionVersionRef.current;
    let cancelled = false;
    const isCurrent = () => !cancelled && version === selectionVersionRef.current;
    fetchWorkout(savedId, user)
      .then((detail) => {
        if (!isCurrent()) return;
        setSelection({
          ownerUid: user.uid,
          ghost: {
            id: detail.id,
            label: "", // 표시 단위는 렌더 시 계산한다. 단위 변경으로 다시 조회하지 않는다.
            distanceM: detail.distanceM,
            path: ensureGhostTimestamps(detail.path, detail.durationSec),
          },
        });
      })
      .catch(() => { if (isCurrent()) clearGhostSelection(); });
    return () => { cancelled = true; };
  }, [user]);

  const elapsedMs = session.status === "idle" ? 0 : session.elapsedSec * 1000;
  const totalMs = useMemo(() => (ghost ? ghostTotalDurationMs(ghost.path) : 0), [ghost]);
  const finished = ghost != null && totalMs > 0 && elapsedMs >= totalMs;
  const gapM = useMemo(() => {
    if (!ghost) return null;
    return session.distanceM - ghostDistanceAtElapsed(ghost.path, elapsedMs);
  }, [elapsedMs, ghost, session.distanceM]);

  function select(next: GhostSelection) {
    if (!user) return;
    selectionVersionRef.current++;
    setSelection({ ownerUid: user.uid, ghost: next });
    saveGhostSelection(next.id);
    setPickerOpen(false);
    void track("ghost_race_started");
  }

  return {
    ghost,
    clear: () => {
      selectionVersionRef.current++;
      setSelection(null);
      clearGhostSelection();
    },
    select,
    pickerOpen,
    openPicker: () => setPickerOpen(true),
    closePicker: () => setPickerOpen(false),
    elapsedMs,
    finished,
    gapM,
  };
}
