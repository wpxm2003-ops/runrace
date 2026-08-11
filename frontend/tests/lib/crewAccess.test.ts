import { describe, expect, it } from "vitest";
import { isCrewAvailable, isLocaleResolved } from "@/lib/crewAccess";
import { LOCALES } from "@/lib/i18n/translations";

describe("crewAccess", () => {
  it("크루는 한국어 사용자에게만 공개한다", () => {
    expect(isCrewAvailable("ko")).toBe(true);
    for (const { code } of LOCALES.filter((l) => l.code !== "ko")) {
      expect(isCrewAvailable(code), code).toBe(false);
    }
  });

  it("로케일 확정 전에는 판정을 미룬다", () => {
    // LocaleProvider의 첫 렌더는 source="initial"에 locale="ko"다. 이때 판정하면
    // en 사용자에게 크루 화면이 한 프레임 보였다가 튕긴다.
    expect(isLocaleResolved("initial")).toBe(false);
    for (const source of ["path", "stored", "browser", "default", "user"] as const) {
      expect(isLocaleResolved(source), source).toBe(true);
    }
  });
});
