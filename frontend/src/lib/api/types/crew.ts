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


