/**
 * SQL·스크립트에 취약한 문자 (그 외 특수문자는 입력 허용).
 * 백엔드 ForbiddenTextChars.java 와 의미를 맞춰야 한다 — 수정 시 양쪽 함께.
 * 주의: 제어문자는 \p{Cc} (과거 \\p{Control} 오타로 평범한 글자가 금지되던 버그 수정).
 */
export const FORBIDDEN_TEXT_RE = /["';\\`<>\p{Cc}]/u;
// strip은 전역 치환이어야 한다 — 비전역 정규식의 replace는 첫 매치만 지운다(붙여넣기 시 나머지 금칙문자 잔존).
// test()는 lastIndex 상태를 타므로 containsForbiddenText는 비전역 정규식을 그대로 쓴다.
const FORBIDDEN_TEXT_RE_GLOBAL = /["';\\`<>\p{Cc}]/gu;

export function containsForbiddenText(value: string): boolean {
  return FORBIDDEN_TEXT_RE.test(value);
}

export function stripForbiddenText(value: string): string {
  return value.replace(FORBIDDEN_TEXT_RE_GLOBAL, "");
}
