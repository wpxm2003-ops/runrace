import type { ko } from "./locales/ko";

export type Locale = "ko" | "en" | "es" | "ja" | "zh";

/** 한국어 사전을 기준으로 모든 로케일의 키와 번역 함수 시그니처를 고정한다. */
export type Translations = typeof ko;
