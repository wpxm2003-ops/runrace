/**
 * API 계층이 사용자에게 직접 보여주는 문구의 단일 출처.
 *
 * <p>`apiError.ts`·`client.ts`는 React 밖의 평범한 모듈이라 `useLocale()`을 쓸 수 없다.
 * 그래서 예전에는 한국어 문장이 그대로 박혀 있었고, 어떤 언어를 쓰든 서버 오류·네트워크
 * 오류·인증 만료 문구만 한국어로 떴다. 로케일 프로바이더가 마운트·언어 변경 시
 * {@link setApiErrorTexts}로 현재 언어의 문구를 등록하면 그 뒤 호출부터 반영된다.
 *
 * <p>기본값은 영어다 — 등록 전(SSR·프로바이더 밖)에 노출되더라도 특정 언어 사용자에게만
 * 유리하지 않도록 중립을 택했다.
 */
export type ApiErrorTexts = {
  /** 5xx — 서버에 닿았지만 처리하지 못했다. */
  serverError: string;
  /** fetch 자체가 실패했다(오프라인·DNS·CORS 등). */
  networkError: string;
  /** 인증이 없거나 만료됐다. */
  loginRequired: string;
};

const DEFAULTS: ApiErrorTexts = {
  serverError: "Couldn't reach the server. Please try again in a moment.",
  networkError: "Please check your network connection.",
  loginRequired: "Please sign in.",
};

let current: ApiErrorTexts = DEFAULTS;

export function setApiErrorTexts(next: ApiErrorTexts): void {
  current = next;
}

export function apiErrorTexts(): ApiErrorTexts {
  return current;
}
