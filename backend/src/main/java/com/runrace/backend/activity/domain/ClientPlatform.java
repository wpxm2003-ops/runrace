package com.runrace.backend.activity.domain;

import java.util.Arrays;
import java.util.Optional;

/**
 * 활동 핑을 보낸 클라이언트 종류. 프론트의 GA4 사용자 속성 {@code platform}과 같은 값을 쓴다.
 *
 * <p>iOS 네이티브 앱은 없다 — 아이폰·아이패드 브라우저(PWA 포함)가 {@link #IOS_WEB}이다.
 * iOS 앱이 생기면 값을 추가하고 프론트 판정(clientPlatform.ts)도 함께 고친다.
 */
public enum ClientPlatform {
  ANDROID_APP("android_app"),
  WEB("web"),
  IOS_WEB("ios_web");

  private final String code;

  ClientPlatform(String code) {
    this.code = code;
  }

  /** DB·API에 쓰는 소문자 코드. */
  public String code() {
    return code;
  }

  /** 알려진 코드만 받아들인다 — 임의 문자열이 집계 테이블에 쌓이지 않게 한다. */
  public static Optional<ClientPlatform> fromCode(String code) {
    if (code == null) return Optional.empty();
    return Arrays.stream(values()).filter(p -> p.code.equals(code)).findFirst();
  }
}
