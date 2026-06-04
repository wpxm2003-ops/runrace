import type { LatLng } from "@/lib/workoutTrack";

/**
 * 백엔드 REST DTO와 1:1로 대응하는 응답/요청 타입.
 * 페이지마다 인라인으로 흩어져 있던 정의를 한 곳에 모은다.
 */

// ── 대결(challenge) ──────────────────────────────────────────────
export type ChallengeListItem = {
  id: number;
  title: string;
  goalKm: number;
  phase: string;
  startAt: string;
  endAt: string | null;
  memberCount: number;
  createdAt: string;
  isOwner: boolean;
};

export type ChallengeMember = {
  userId: string;
  displayName: string | null;
  totalKm: string;
  remainingKm: string;
  progressPercent: number | string;
  finished: boolean;
};

export type ChallengeWinner = {
  userId: string;
  displayName: string | null;
};

export type ChallengeDetail = {
  id: number;
  title: string;
  goalKm: number;
  maxMembers: number;
  startAt: string;
  endAt: string | null;
  creatorUserId: string;
  isMember: boolean;
  isOwner: boolean;
  hasStarted: boolean;
  hasEnded: boolean;
  showManage: boolean;
  canJoin: boolean;
  memberCount: number;
  winner: ChallengeWinner | null;
  members: ChallengeMember[];
};

export type ActiveCount = { activeCount: number; maxActive: number };

export type ChallengeFormBody = {
  title: string;
  goalKm: number;
  maxMembers: number;
  startDate: string;
  endDate: string;
};

// ── 친구(friend) ─────────────────────────────────────────────────
export type Friend = {
  id: string;
  displayName: string | null;
  photoUrl: string | null;
  email: string | null;
};

export type InviteResult = { code: string; expiresAt: string };

// ── 거리 동기화(fitness) ─────────────────────────────────────────
export type DailyDistanceResult = { prevKm: string; nowKm: string; deltaKm: string };

export type DailyDistanceBody = { date: string; source: string; distanceKm: number };

// ── 운동(workout) ────────────────────────────────────────────────
export type WorkoutListItem = {
  id: number;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  distanceM: number;
  calories: number;
  avgPaceSecPerKm: number | null;
};

export type WorkoutDetail = WorkoutListItem & { path: LatLng[] };

export type WorkoutCreateBody = {
  startedAt: string;
  endedAt: string;
  durationSec: number;
  distanceM: number;
  calories: number;
  avgPaceSecPerKm: number | null;
  path: LatLng[];
};

/** 단일 식별자만 돌려주는 생성 응답(대결/운동 공용). */
export type CreatedId = { id: number };
