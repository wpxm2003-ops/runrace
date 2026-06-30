package com.runrace.backend.common;

/** URL 경로 변수 정규식의 단일 출처. 컨트롤러 매핑·인증 필터가 공유한다. */
public final class PathPatterns {
  private PathPatterns() {}

  /** 숫자 ID 경로 변수 제약. 예: {@code @GetMapping("/{id:" + PathPatterns.ID + "}")} */
  public static final String ID = "[0-9]+";
}
