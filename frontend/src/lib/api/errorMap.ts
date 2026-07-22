/**
 * 에러코드 문자열 포함 여부로 번역된 메시지를 고르는 공용 매퍼.
 * 화면마다 에러코드→문구가 다르므로(같은 crew_full도 파일마다 다른 번역 키) 전역 테이블은 두지 않고
 * 각 콜사이트가 자기 규칙 배열을 만들어 넘긴다. 여기선 반복되는 순회+포함검사 루프만 공유한다.
 *
 * fallback은 지연 평가(함수)로 받는다 — reportAndDisplay(e)처럼 부수효과(에러 리포트 전송)가 있는
 * 폴백을 쓰는 콜사이트가 있어서, 특정 코드가 매칭됐을 때도 항상 실행되면 안 된다.
 */
export function mapErrorMessage(
  e: unknown,
  rules: { codes: string[]; message: string }[],
  fallback: () => string,
): string {
  const msg = String(e);
  for (const rule of rules) {
    if (rule.codes.some((code) => msg.includes(code))) return rule.message;
  }
  return fallback();
}
