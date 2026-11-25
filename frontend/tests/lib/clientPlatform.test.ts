import { describe, expect, it } from "vitest";
import { resolveClientPlatform } from "@/lib/clientPlatform";

describe("클라이언트 플랫폼 판정(GA4 platform 속성·일일 활성 핑)", () => {
  it("Capacitor Android 앱은 android_app", () => {
    expect(resolveClientPlatform({ nativePlatform: "android", iosWeb: false })).toBe("android_app");
  });

  it("네이티브가 아닌 아이폰·아이패드 브라우저는 ios_web", () => {
    expect(resolveClientPlatform({ nativePlatform: null, iosWeb: true })).toBe("ios_web");
  });

  it("그 밖의 브라우저(데스크톱·안드로이드 모바일 웹)는 web", () => {
    expect(resolveClientPlatform({ nativePlatform: null, iosWeb: false })).toBe("web");
  });

  it("아직 없는 iOS 네이티브 앱을 android_app으로 잘못 세지 않는다", () => {
    expect(resolveClientPlatform({ nativePlatform: "ios", iosWeb: false })).not.toBe("android_app");
  });
});
