/** SQL·스크립트에 취약한 문자 (그 외 특수문자는 입력 허용) */
export const FORBIDDEN_TEXT_RE = /["';\\`<>\\p{Control}]/u;

/** 안내 문구에 표시할 금지 문자 목록 */
export const FORBIDDEN_TEXT_CHARS_LABEL = `' " ; \\ \` < >`;

export function containsForbiddenText(value: string): boolean {
  return FORBIDDEN_TEXT_RE.test(value);
}

export function stripForbiddenText(value: string): string {
  return value.replace(FORBIDDEN_TEXT_RE, "");
}
