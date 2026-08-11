import type { Locale } from "@/lib/i18n/translations";
import type { LocaleSource } from "@/lib/i18n/localeSource";

/**
 * 크루 기능 공개 범위 — 현재는 한국어 사용자 전용.
 *
 * 크루는 글로벌 대응이 덜 끝났다: 월간 보드·잔디·명예의 전당·대항전 기간이 전부 KST 공동
 * 마감이고(docs/globalization-todo.md), 지역 필터는 한국 시도 코드만 있으며, 정기런 요일·장소
 * 같은 안내 문구도 한국 기준으로 쓰여 있다. 번역만 채운다고 쓸 만해지지 않는 축이라
 * 준비될 때까지 진입 자체를 막는다.
 *
 * 로케일 하나로만 판정한다 — 계정 국가나 위치를 따로 저장하지 않고, 사용자가 언어를 바꾸면
 * 그 즉시 반영되는 편이 예측 가능하다.
 */
export function isCrewAvailable(locale: Locale): boolean {
  return locale === "ko";
}

/**
 * 라우트 가드가 판단을 내려도 되는 시점인지.
 *
 * LocaleProvider는 첫 렌더에서 로케일을 "ko"(source: "initial")로 두고 effect에서 실제 값을
 * 확정한다. 그 사이에 판정하면 en 사용자에게 크루 화면이 한 프레임 보였다가 튕기고,
 * 반대로 ko 사용자를 잘못 내보낼 수도 있다. 확정 전에는 아무 것도 하지 않는다.
 */
export function isLocaleResolved(source: LocaleSource): boolean {
  return source !== "initial";
}
