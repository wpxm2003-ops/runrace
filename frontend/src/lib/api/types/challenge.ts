import type { WorkoutType } from "./workout";

/**
 * 백엔드 REST DTO와 1:1로 대응하는 응답/요청 타입.
 * 페이지마다 인라인으로 흩어져 있던 정의를 한 곳에 모은다.
 */

// ── 레이스(challenge) ──────────────────────────────────────────────
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
  /** 경품이 하나라도 걸린 레이스인지 — 목록 '경품' 뱃지용. */
  hasPrize: boolean;
  /** 내기 문구가 걸린 레이스인지 — 목록 선물 아이콘용. */
  hasStake: boolean;
  /** 크루 전용 레이스인지 — 목록 '크루' 라벨용(내 레이스는 공개·크루 레이스가 섞여 나온다). */
  crewOnly: boolean;
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
  /** 완주 시각(ISO). 미완주면 null — 승부 요약 시간 차 계산용. */
  finishedAt: string | null;
  /** 종료 시 확정 순위(1=우승). 진행 중이면 null. */
  finalRank: number | null;
  /** 로그인 사용자가 등록한 라이벌인지 — 색/라벨 표시용. */
  isRival: boolean;
  /**
   * 이 멤버의 실시간 진행률이 신선(15분 이내)한지 — 로그인 사용자에게만 true일 수 있다.
   * 비인증 호출자에게는 항상 false. true면 totalKm에 라이브 값이 이미 접혀 있다.
   */
  liveActive: boolean;
};

/** 현재 사용자 기준, 특정 상대(라이벌)와의 누적 전적. */
export type HeadToHeadRow = {
  opponentUserId: string;
  wins: number;
  losses: number;
};

/** 라이벌 목록 한 줄 — 닉네임 + 나 기준 누적 전적. 승률은 프론트에서 계산. */
export type RivalRow = {
  rivalUserId: string;
  nickname: string | null;
  wins: number;
  losses: number;
};

// ── 실시간 진행률(live progress) ────────────────────────────────────
/** 러닝 중 라이벌과의 실시간 격차 한 줄. gapM: (내 진행 distanceM) - (라이벌의 현재 최선값, m). 양수 = 내가 앞섬. */
export type LiveRivalGap = {
  userId: string;
  nickname: string | null;
  gapM: number;
};

/** 핑 응답에서 챌린지 하나에 대한 라이벌 격차 묶음. */
export type LiveProgressChallenge = {
  challengeId: number;
  rivalGaps: LiveRivalGap[];
};

/** POST /api/challenges/live-progress 응답. */
export type LiveProgressResponse = {
  challenges: LiveProgressChallenge[];
};

/**
 * 실시간 진행률 공유 설정 — 공개 레이스·크루 레이스를 각각 켜고 끈다.
 * 기본값이 다르다: 공개는 false(동의 후 시작), 크루는 true(폐쇄 로스터라 기본 허용).
 */
export type LiveProgressSetting = {
  publicEnabled: boolean;
  crewEnabled: boolean;
};

export type ChallengeDetail = {
  id: number;
  title: string;
  goalKm: number;
  maxMembers: number;
  startAt: string;
  endAt: string | null;
  /** 내기(페널티/보상) 텍스트 — 없으면 null. */
  stake: string | null;
  /** 크루 내부 레이스면 크루명(뱃지 표시용). 일반 레이스면 null. */
  crewName: string | null;
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
  members: ChallengeMember[];
  /**
   * 지금 달리는 중인 다른 멤버 수(익명 집계, 본인 제외).
   * 라이브를 볼 자격이 없는 조회자(비인증·종료된 레이스·크루 외부)에게는 항상 0이다.
   */
  liveRunnerCount: number;
};

export type ChallengeWorkoutListItem = {
  userId: string;
  nickname: string | null;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  distanceM: number;
  appliedDistanceM: number;
  workoutType: WorkoutType;
};

export type ActiveCount = { activeCount: number; maxActive: number };

// ── 경품(prize) ──────────────────────────────────────────────────
/** 경품 한 줄. 경품명·이미지 유무·수령 여부만(S3 키는 서버가 반환하지 않음). */
export type PrizeRow = {
  rank: number;
  name: string;
  hasImage: boolean;
  viewed: boolean;
  awardType: PrizeAwardType;
};

export type PrizeAwardType = "RANK" | "RANDOM_FINISHER";

export type PrizeResult = {
  awardType: PrizeAwardType;
  status: "BEFORE_END" | "NOT_ELIGIBLE" | "NOT_WINNER" | "WINNER";
  prizeRank: number | null;
  prizeName: string | null;
  hasImage: boolean;
};

/** 경품 저장 항목 — 등수·경품명(필수)·이미지 비공개 키(선택). */
export type PrizeFormItem = {
  rank: number;
  name: string;
  /** 새로 업로드한 이미지의 비공개 키. keepImage=true이면 무시. */
  imageKey: string | null;
  /** true면 서버에 저장된 기존 이미지를 보존하도록 요청 (수정 시 사용). */
  keepImage?: boolean;
  /**
   * keepImage=true일 때 보존할 기존 이미지의 '원본 등수'.
   * 편집 중 순서가 바뀌어 rank가 재부여돼도 이미지를 정확히 매칭하기 위한 안정 식별자.
   */
  keepImageFromRank?: number | null;
};

export type ChallengeFormBody = {
  title: string;
  goalKm: number;
  maxMembers: number;
  startAt: string;
  endAt: string;
  /** 내기(페널티/보상) 텍스트 — 선택값. 빈 문자열이면 백엔드에서 null로 저장. */
  stake?: string;
  /** 생성 시점 작성자 UI 언어. 생성에만 전송하며 수정 시에는 무시된다(백엔드가 고정값 유지). */
  langCd?: string;
  /** true면 내 크루 내부 레이스로 생성(멤버 전용·공개 목록 제외). 생성에만 사용. */
  crewOnly?: boolean;
};


