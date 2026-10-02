import type { LatLng } from "@/lib/workoutTrack";

// ── 운동(workout) ────────────────────────────────────────────────
export type WorkoutType = "GPS" | "INDOOR";

export type WorkoutListItem = {
  id: number;
  startedAt: string;
  /** 기기 벽시계 시작 시각(타임존 없음). 달력·잔디의 날짜 그루핑 기준. 캐시된 구응답엔 없다. */
  startedAtLocal?: string;
  endedAt: string;
  durationSec: number;
  distanceM: number;
  calories: number;
  avgPaceSecPerKm: number | null;
  workoutType: WorkoutType;
};

/** 전체 운동 기록 요약 (GET /api/workouts/summary). */
export type WorkoutSummary = {
  totalDistanceM: number;
  totalDurationSec: number;
  totalCalories: number;
  workoutCount: number;
  workoutDayCount: number;
  avgPaceSecPerKm: number | null;
  maxStreakDays: number;
};

export type WorkoutDetail = WorkoutListItem & {
  path: LatLng[];
  imageUrl: string | null;
  memo?: string | null;
  /** 이 러닝에 귀속된 신발. 없으면 null. */
  shoeId?: number | null;
  shoeName?: string | null;
};

export type PreviousWorkout = {
  distanceM: number;
  durationSec: number;
  avgPaceSecPerKm: number | null;
};

/** GET /api/workouts/{id}/comparison — 최근 30일 평균 + 직전 기록. */
export type WorkoutComparison = {
  recentCount: number;
  avgPaceSec: number | null;
  avgDistanceM: number;
  avgDurationSec: number;
  previous: PreviousWorkout | null;
};

export type WorkoutCreateBody = {
  clientWorkoutId: string;
  startedAt: string;
  /** 시작 시각의 기기 벽시계(타임존 없음). */
  startedAtLocal: string;
  endedAt: string;
  durationSec: number;
  distanceM: number;
  calories: number;
  avgPaceSecPerKm: number | null;
  path: LatLng[];
  bestSegments: Record<string, number>;
  ghostWorkoutId: number | null;
  ghostResult: {
    overlapDistanceM: number;
    myTimeMs: number;
    ghostTimeMs: number;
    deltaMs: number;
  } | null;
};

export type IndoorRunCreateBody = {
  clientWorkoutId: string;
  distanceM: number;
  durationSec: number;
  startedAt: string;
  /** 시작 시각의 기기 벽시계(타임존 없음). */
  startedAtLocal: string;
  imageUrl: string | null;
};

/** 실내러닝 승인 대기 항목 */
export type PendingApproval = {
  challengeWorkoutId: number;
  workoutId: number;
  submitterNickname: string | null;
  distanceM: number;
  durationSec: number;
  avgPaceSecPerKm: number | null;
  imageUrl: string | null;
  startedAt: string;
  myVote: boolean | null;
  canVote: boolean;
  totalVoters: number;
  approvedCount: number;
};

/** 실내러닝 거부된 항목 */
export type RejectedApproval = {
  challengeWorkoutId: number;
  workoutId: number;
  submitterNickname: string | null;
  distanceM: number;
  durationSec: number;
  imageUrl: string | null;
  startedAt: string;
  rejectorNicknames: string[];
};

/** 단일 식별자만 돌려주는 생성 응답(레이스 공용). */
export type CreatedId = { id: number };

export type PersonalBest = {
  distanceKey: string;
  previousPaceSec: number;
  newPaceSec: number;
  daysSincePrevious: number;
};

/** GET /api/workouts/personal-bests — 내 PB 목록. 레이스 환산 시간 = bestPaceSec × distanceM/1000. */
export type PersonalBestRow = {
  distanceKey: string;
  bestPaceSec: number;
  distanceM: number;
  workoutId: number;
  achievedAt: string;
};

/**
 * 운동 저장 직후 서버가 판정한 "오늘의 성과" 한 건.
 * 문구는 code + value로 프론트가 로컬라이즈한다(서버는 판정만).
 * value/value2의 의미는 code마다 다르다 — 아래 achievementText 참고.
 */
export type Achievement = {
  code: string;
  value: number | null;
  value2: number | null;
};

export type CreateWorkoutResponse = {
  id: number;
  personalBest: PersonalBest | null;
  achievements?: Achievement[];
};

/** 공개 공유 페이지용 운동 데이터 (인증 불필요). */
export type WorkoutShare = {
  durationSec: number;
  distanceM: number;
  calories: number;
  avgPaceSecPerKm: number | null;
  startedAt: string;
  /** 기기 벽시계 시작 시각(타임존 없음). 구응답 캐시에는 없다. */
  startedAtLocal?: string;
  path: LatLng[];
  workoutType: WorkoutType;
  imageUrl: string | null;
};

