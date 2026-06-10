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
  /** 로그인 사용자가 이 레이스에 참여 중인지 — 공개 목록의 참여 라벨용. */
  isMember: boolean;
};

/** 공개 목록 페이지 응답 (무한스크롤). */
export type ChallengeListPage = {
  items: ChallengeListItem[];
  hasNext: boolean;
};

export type ChallengeMember = {
  userId: string;
  nickname: string | null;
  totalKm: string;
  remainingKm: string;
  progressPercent: number | string;
  finished: boolean;
};

export type ChallengeWinner = {
  userId: string;
  nickname: string | null;
};

export type ChallengeDetail = {
  id: number;
  title: string;
  goalKm: number;
  maxMembers: number;
  startAt: string;
  endAt: string | null;
  creatorUserId: string;
  /** 로그인 사용자 UUID. 비로그인이면 null */
  currentUserId: string | null;
  isMember: boolean;
  isOwner: boolean;
  hasStarted: boolean;
  hasEnded: boolean;
  showManage: boolean;
  canJoin: boolean;
  canLeave: boolean;
  memberCount: number;
  winner: ChallengeWinner | null;
  members: ChallengeMember[];
};

export type ChallengeWorkoutListItem = {
  workoutId: number;
  userId: string;
  nickname: string | null;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  distanceM: number;
  appliedDistanceM: number;
};

export type ActiveCount = { activeCount: number; maxActive: number };

export type ChallengeFormBody = {
  title: string;
  goalKm: number;
  maxMembers: number;
  startAt: string;
  endAt: string;
  /** 생성 시점 작성자 UI 언어. 생성에만 전송하며 수정 시에는 무시된다(백엔드가 고정값 유지). */
  langCd?: string;
};

// ── 내 정보 ──────────────────────────────────────────────────────
export type MeResponse = {
  id: string;
  firebaseUid: string;
  email: string | null;
  displayName: string | null;
  nickname: string | null;
  provider: string | null;
  langCd: string;
};

// ── 친구(friend) ─────────────────────────────────────────────────
export type Friend = {
  id: string;
  nickname: string | null;
  email: string | null;
};

export type InviteResult = { code: string; expiresAt: string };

// ── 거리 동기화(fitness) ─────────────────────────────────────────
export type DailyDistanceResult = { prevKm: string; nowKm: string; deltaKm: string };

export type DailyDistanceBody = { date: string; source: string; distanceKm: number };

// ── 운동(workout) ────────────────────────────────────────────────
export type WorkoutType = "GPS" | "INDOOR";

export type WorkoutListItem = {
  id: number;
  startedAt: string;
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
};

export type WorkoutDetail = WorkoutListItem & {
  path: LatLng[];
  imageUrl: string | null;
};

export type WorkoutCreateBody = {
  startedAt: string;
  endedAt: string;
  durationSec: number;
  distanceM: number;
  calories: number;
  avgPaceSecPerKm: number | null;
  path: LatLng[];
};

export type IndoorRunCreateBody = {
  distanceM: number;
  durationSec: number;
  startedAt: string;
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

/** 단일 식별자만 돌려주는 생성 응답(대결/운동 공용). */
export type CreatedId = { id: number };

/** 공개 공유 페이지용 운동 데이터 (인증 불필요). */
export type WorkoutShare = {
  durationSec: number;
  distanceM: number;
  calories: number;
  avgPaceSecPerKm: number | null;
  startedAt: string;
  path: LatLng[];
  workoutType: WorkoutType;
  imageUrl: string | null;
};
