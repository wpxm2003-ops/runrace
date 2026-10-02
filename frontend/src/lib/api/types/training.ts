export type TrainingPlan = {
  vdot: number;
  thresholdPaceSec: number;
  subTDays: number[];
  sourceDistanceM: number;
  sourceTimeSec: number;
  weeklyBand?: number | null;
  updatedAt?: string;
};

export type NsmSessionLogBody = {
  workoutId: number | null;
  day: number;
  kind: "SHORT" | "MEDIUM" | "LONG";
  targetPaceSec: number | null;
  repsPlanned: number | null;
  repsDone: number;
  completed: boolean;
};

export type NsmWeeklyProgress = { completed: number; planned: number };

export type NsmRetestPoint = {
  id: number;
  createdAt: string;
  vdot: number;
  thresholdPaceSec: number;
  sourceDistanceM: number;
  sourceTimeSec: number;
};

export type NsmMyReport = {
  retests: NsmRetestPoint[];
  totalSubTCompleted: number;
  totalSubTMinutes: number;
  latestBlockRetestId: number | null;
};

export type NsmBlockReport = {
  days: number;
  startVdot: number;
  endVdot: number;
  startThresholdPaceSec: number;
  endThresholdPaceSec: number;
  startSourceDistanceM: number;
  startSourceTimeSec: number;
  endSourceDistanceM: number;
  endSourceTimeSec: number;
  subTCompleted: number;
  subTMinutes: number;
};
