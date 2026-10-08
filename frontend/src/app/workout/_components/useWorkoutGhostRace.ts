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
  const [ghost, setGhost] = useState<GhostSelection | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const syncReadyRef = useRef(false);

  useEffect(() => {
    if (!syncReadyRef.current) {
      syncReadyRef.current = true;
      return;
    }
    if (ghost) saveGhostSelection(ghost.id);
    else clearGhostSelection();
  }, [ghost]);

  useEffect(() => {
    if (!user) return;
    const savedId = loadGhostSelection();
    if (savedId == null) return;
    fetchWorkout(savedId, user)
      .then((detail) => {
        setGhost({
          id: detail.id,
          label: formatDistance(detail.distanceM, unit),
          distanceM: detail.distanceM,
          path: ensureGhostTimestamps(detail.path, detail.durationSec),
        });
      })
      .catch(() => clearGhostSelection());
  }, [unit, user]);

  const elapsedMs = session.status === "idle" ? 0 : session.elapsedSec * 1000;
  const totalMs = useMemo(() => (ghost ? ghostTotalDurationMs(ghost.path) : 0), [ghost]);
  const finished = ghost != null && totalMs > 0 && elapsedMs >= totalMs;
  const gapM = useMemo(() => {
    if (!ghost) return null;
    return session.distanceM - ghostDistanceAtElapsed(ghost.path, elapsedMs);
  }, [elapsedMs, ghost, session.distanceM]);

  function select(next: GhostSelection) {
    setGhost(next);
    setPickerOpen(false);
    void track("ghost_race_started");
  }

  return {
    ghost,
    clear: () => setGhost(null),
    select,
    pickerOpen,
    openPicker: () => setPickerOpen(true),
    closePicker: () => setPickerOpen(false),
    elapsedMs,
    finished,
    gapM,
  };
}
