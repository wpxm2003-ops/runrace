import type { PersonalBest } from "./api/types";
import type { GhostRaceResult } from "./ghostRace";

export type CelebrationInput = {
  /**
   * 화면에 그려질 수 있는 성과 카드 수 — 응답 배열 길이가 아니다.
   * 서버가 새 성과 코드를 먼저 배포하면 achievementView가 null로 버리므로,
   * 원본 길이로 판정하면 "제목만 있고 내용은 없는" 빈 모달이 뜬다.
   */
  achievementCount: number;
  personalBest: PersonalBest | null;
  ghostResult: GhostRaceResult | null;
  /**
   * 고스트 카드는 결과와 라벨이 둘 다 있어야 렌더된다 — 한쪽만 보고 열면 빈 모달이 된다.
   * 빈 문자열도 카드가 렌더되지 않으므로 없는 것으로 친다(재시도용 로컬 보관 데이터는 검증 없이 읽힌다).
   */
  ghostLabel: string | null;
};

export type CelebrationTone = {
  /** 모달을 띄울지. 보여줄 카드가 하나도 없으면 띄우지 않고 바로 상세로 보낸다. */
  show: boolean;
  /** 축하 연출(confetti·🎉·축하 문구)을 함께 낼지. */
  celebratory: boolean;
};

/**
 * 운동 저장 직후 축하 모달을 띄울지, 띄운다면 축하 연출까지 할지 결정한다.
 * GPS·실내런 두 경로가 이 함수 하나를 공유한다 — 한쪽만 고치면 다시 어긋난다.
 *
 * <p>"내세울 게 없으면 아무것도 띄우지 않는다"는 백엔드 AchievementService의 판정 철학을
 * 화면에서도 지킨다. 매번 confetti를 뿌리면 성과 자체가 값싸진다.
 *
 * <p>고스트 패배·무승부는 <b>모달은 띄우되 축하 연출만 뺀다</b>. 훈련 제안 CTA가 고스트 카드
 * 안에 있어서, 패배를 모달에서 제외하면 그 기능(+7일 캡·노출 지표)이 통째로 사라진다.
 */
export function celebrationTone(input: CelebrationInput): CelebrationTone {
  const hasAchievement = input.achievementCount > 0;
  const hasPb = input.personalBest != null;
  // 카드 렌더 조건(`ghostResult && ghostLabel`)과 같은 truthy 판정을 써야 게이트와 화면이 어긋나지 않는다.
  const hasGhost = input.ghostResult != null && !!input.ghostLabel;

  // 카드에 찍히는 초와 같은 반올림을 써야 "1초 앞섰다"고 써놓고 연출은 중립인 모순이 없다.
  const deltaSec = input.ghostResult
    ? Math.round(Math.abs(input.ghostResult.deltaMs) / 1000)
    : 0;
  const ghostWon = hasGhost && input.ghostResult!.deltaMs < 0 && deltaSec > 0;

  return {
    show: hasAchievement || hasPb || hasGhost,
    celebratory: hasAchievement || hasPb || ghostWon,
  };
}
