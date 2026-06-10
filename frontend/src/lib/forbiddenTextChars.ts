/**
 * SQL·스크립트에 취약한 문자 (그 외 특수문자는 입력 허용).
 * 백엔드 ForbiddenTextChars.java 와 의미를 맞춰야 한다 — 수정 시 양쪽 함께.
 * 주의: 제어문자는 \p{Cc} (과거 \\p{Control} 오타로 평범한 글자가 금지되던 버그 수정).
 */
export const FORBIDDEN_TEXT_RE = /["';\\`<>\p{Cc}]/u;

export function containsForbiddenText(value: string): boolean {
  return FORBIDDEN_TEXT_RE.test(value);
}

export function stripForbiddenText(value: string): string {
  return value.replace(FORBIDDEN_TEXT_RE, "");
}
