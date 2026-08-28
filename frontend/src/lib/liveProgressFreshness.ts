/**
 * 라이브 핑 응답이 현재 런에서 가장 최근에 발급된 요청의 것인지 확인한다.
 *
 * 같은 계정으로 런을 곧바로 다시 시작하거나 force 핑이 겹치면 먼저 보낸 응답이 나중에
 * 도착할 수 있다. 런 ID와 순서 토큰을 함께 비교해야 이전 거리·격차가 화면을 덮지 않는다.
 */
export function isLatestLiveProgressResponse(
  requestClientWorkoutId: string,
  requestSentAt: number,
  currentClientWorkoutId: string | null,
  latestSentAt: number,
): boolean {
  return (
    requestClientWorkoutId === currentClientWorkoutId
    && requestSentAt === latestSentAt
  );
}
