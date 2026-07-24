import type { LatLng } from "@/lib/workoutTrack";

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

// ── 크루(crew) ────────────────────────────────────────────────────
/** 월간 보드 한 줄 — 이번 달(KST 1일 시작) 거리·횟수. 서버가 거리 내림차순으로 정렬해 준다. */
export type CrewMemberRow = {
  userId: string;
  nickname: string | null;
  isLeader: boolean;
  isMe: boolean;
  monthDistanceM: number;
  monthRuns: number;
};

export type CrewView = {
  id: number;
  name: string;
  notice: string | null;
  joinCode: string;
  isLeader: boolean;
  maxMembers: number;
  /** 크루원 1인당 월간 목표(km). null이면 목표 없음. */
  monthGoalKm: number | null;
  /** 멤버별 가입 이후 운동 합산(m) — 함께 달린 누적. */
  allTimeDistanceM: number;
  members: CrewMemberRow[];
};

/** 내 크루 홈 응답 — 미소속이면 crew가 null. */
export type MyCrewResponse = {
  crew: CrewView | null;
};

/** 크루 잔디 + 명예의 전당 — 크루 홈 부가 콘텐츠. */
export type CrewInsights = {
  /** 잔디 그리드 시작일(이번 달 1일, ISO date) — 캘린더 월 기준이라 매달 그리드 모양이 다르다. */
  heatmapFrom: string;
  memberCount: number;
  /** 기록 있는 날만 담김(빈 날은 프론트가 0으로 채움). nicknames는 가입 순 최대 10명. */
  heatmap: { date: string; runners: number; nicknames: (string | null)[] }[];
  /** 월별 MVP(최신월 우선, 이번 달 제외, 최대 12개월). */
  hallOfFame: { month: string; nickname: string | null; distanceM: number }[];
};

/** 크루 검색 결과 한 줄(도전장 상대 선택용). */
export type CrewSearchItem = {
  id: number;
  name: string;
  memberCount: number;
};

/** 시도 지역 코드 — 발견 목록 필터·크루 프로필 공용 화이트리스트. ETC=기타(백필), ONLINE=온라인/전국. */
export type CrewRegion =
  | "SEOUL" | "BUSAN" | "DAEGU" | "INCHEON" | "GWANGJU" | "DAEJEON" | "ULSAN" | "SEJONG"
  | "GYEONGGI_SOUTH" | "GYEONGGI_NORTH" | "GANGWON" | "CHUNGBUK" | "CHUNGNAM" | "JEONBUK" | "JEONNAM"
  | "GYEONGBUK" | "GYEONGNAM" | "JEJU" | "ONLINE" | "ETC";

/** 크루 발견 목록 카드 한 줄(리치) — 지역·이미지·정기런 요약. */
export type CrewDiscoveryItem = {
  id: number;
  name: string;
  region: CrewRegion;
  imageUrl: string | null;
  memberCount: number;
  maxMembers: number;
  meetupPlace: string | null;
  /** 월=0…일=6, 정기런 없으면 빈 배열. */
  meetupDays: number[];
  meetupTime: string | null;
};

export type CrewDiscoveryResponse = {
  crews: CrewDiscoveryItem[];
  hasMore: boolean;
};

/** 공개 크루 상세 — 비회원도 조회 가능(멤버 명단은 비공개, 인원수만). */
export type CrewDetail = {
  id: number;
  name: string;
  region: CrewRegion;
  imageUrl: string | null;
  imageUrls: string[];
  intro: string | null;
  memberCount: number;
  maxMembers: number;
  meetupPlace: string | null;
  meetupDays: number[];
  meetupTime: string | null;
  createdAt: string;
  /** 실제 크루 창설일(선택, "YYYY-MM-DD"). null이면 상세 화면에 createdAt을 대신 표시한다. */
  foundedAt: string | null;
  leaderNickname: string | null;
  isFull: boolean;
  /** 로그인 + 이 크루에 대기중 신청이 있을 때만 "PENDING", 그 외 null. */
  myApplicationStatus: "PENDING" | null;
  /** 로그인 + 이 크루에서 최근 거절돼 24h 쿨다운 중이면 true. */
  inCooldown: boolean;
};

/** 크루 발견 프로필(리더 전용 수정) — 지역(필수)·이미지·소개·정기런·창설일(전부 선택). */
export type CrewProfileBody = {
  region: CrewRegion;
  imageUrl: string | null;
  imageUrls: string[];
  intro: string | null;
  meetupPlace: string | null;
  meetupDays: number[];
  meetupTime: string | null;
  foundedAt: string | null;
};

/** 리더 인박스 한 줄 — 대기중 가입신청. */
export type CrewJoinRequestRow = {
  requestId: number;
  applicantUserId: string;
  applicantNickname: string | null;
  message: string | null;
  appliedAt: string;
};

/** 내 신청 현황 한 줄 — 대기중인 가입신청. */
export type MyApplicationRow = {
  requestId: number;
  crewId: number;
  crewName: string;
  appliedAt: string;
};

// ── 크루 대항전(crew match) ───────────────────────────────────────
export type CrewMatchStatus =
  | "PENDING"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "ENDED"
  | "DECLINED"
  | "EXPIRED";

export type CrewMatchResult = "WIN" | "LOSS" | "DRAW" | null;

/** 대항전 요약(크루 홈 카드용). 거리·result는 내 크루 관점. */
export type CrewMatchSummary = {
  id: number;
  status: CrewMatchStatus;
  challengerCrewName: string;
  opponentCrewName: string;
  myCrewIsChallenger: boolean;
  rosterSize: number;
  startAt: string | null;
  endAt: string | null;
  myCrewDistanceM: number;
  opponentCrewDistanceM: number;
  result: CrewMatchResult;
};

/** 크루 홈 대항전 섹션 응답. */
export type MyCrewMatches = {
  record: { wins: number; losses: number; draws: number };
  current: CrewMatchSummary | null;
  pendingReceived: CrewMatchSummary[];
  pendingSent: CrewMatchSummary[];
  lastEnded: CrewMatchSummary | null;
};

export type CrewMatchHistoryPage = {
  items: CrewMatchSummary[];
  hasNext: boolean;
};

export type CrewMatchRosterRow = {
  userId: string;
  nickname: string | null;
  isMe: boolean;
  distanceM: number;
};

/** 대항전 상세 — 거리는 도전/상대 크루 기준, result만 내 크루 관점. */
export type CrewMatchDetail = {
  id: number;
  status: CrewMatchStatus;
  challengerCrewName: string;
  opponentCrewName: string;
  myCrewIsChallenger: boolean;
  rosterSize: number;
  createdAt: string;
  startAt: string | null;
  endAt: string | null;
  canAccept: boolean;
  canDecline: boolean;
  canCancel: boolean;
  challengerDistanceM: number;
  opponentDistanceM: number;
  result: CrewMatchResult;
  challengerRoster: CrewMatchRosterRow[];
  opponentRoster: CrewMatchRosterRow[];
};

/** 지난주(월~일 완결 주) 크루 결산. 기록 없던 주면 totalRuns=0. */
export type CrewRecapLeader = {
  rank: number;
  nickname: string | null;
  distanceM: number;
};

export type CrewRecap = {
  weekStartDate: string;
  weekEndDate: string;
  totalDistanceM: number;
  totalRuns: number;
  participantCount: number;
  mvpNickname: string | null;
  mvpDistanceM: number;
  leaders: CrewRecapLeader[];
};

// ── 신발장(shoe) ──────────────────────────────────────────────────
/** 신발 한 줄 — 누적 거리(totalDistanceM, m) 포함. 활성 신발로 이후 러닝이 자동 귀속된다. */
export type ShoeRow = {
  id: number;
  brand: string;
  model: string;
  nickname: string | null;
  /** 교체 권장 목표 거리(m). null이면 알림 없음. */
  targetDistanceM: number | null;
  active: boolean;
  totalDistanceM: number;
};

/** 신발 등록/수정 요청. active는 등록 시에만 반영(수정은 활성화 전용 API). */
export type ShoeFormBody = {
  brand: string;
  model: string;
  nickname?: string | null;
  targetDistanceM?: number | null;
  active?: boolean;
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
  startedAt: string;
  endedAt: string;
  durationSec: number;
  distanceM: number;
  calories: number;
  avgPaceSecPerKm: number | null;
  path: LatLng[];
  bestSegments: Record<string, number>;
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
  achievedAt: string;
};

// ── NSM 훈련 플랜 ─────────────────────────────────────────────────
/** 활성 NSM 플랜. 주간 스케줄은 thresholdPaceSec + subTDays(월=0…일=6)로 프론트가 생성. */
export type TrainingPlan = {
  vdot: number;
  thresholdPaceSec: number;
  subTDays: number[];
  sourceDistanceM: number;
  sourceTimeSec: number;
  /** 주간 러닝 볼륨 밴드(0~4). 미지정(레거시 플랜)이면 null/undefined. */
  weeklyBand?: number | null;
  /** 응답에서만 채워짐(서버가 설정) — 저장 요청 시엔 보내지 않는다. */
  updatedAt?: string;
};

export type CreateWorkoutResponse = {
  id: number;
  personalBest: PersonalBest | null;
};

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
