import { en } from "./locales/en";
import { es } from "./locales/es";
import { ja } from "./locales/ja";
import { ko } from "./locales/ko";
import { zh } from "./locales/zh";
import type { Locale, Translations } from "./translationTypes";

export type { Locale, Translations } from "./translationTypes";

/** 언어별 사전. 기존 translations[locale] 공개 API를 유지한다. */
export const translations = {
  ko,
  en,
  es,
  ja,
  zh,
} satisfies Record<Locale, Translations>;

/** 언어 선택 드롭다운에 노출할 순서·표기(각 언어 자기 이름). */
export const LOCALES: { code: Locale; label: string }[] = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
];
