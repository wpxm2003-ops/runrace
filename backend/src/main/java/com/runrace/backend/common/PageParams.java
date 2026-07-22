package com.runrace.backend.common;

/**
 * 목록 API의 page/size 파라미터 클램핑 단일 출처 — page는 0 이상, size는 1~{@value #MAX_SIZE}.
 * 이전엔 컨트롤러마다 Math.min(Math.max(size,1),50) 같은 식을 반복하면서 일부는 page 클램핑을
 * 빠뜨리고 있었다(음수 page가 PageRequest.of()의 IllegalArgumentException으로 이어져 500 처리됨).
 */
public final class PageParams {
  private PageParams() {}

  public static final int MAX_SIZE = 50;

  public record Clamped(int page, int size) {}

  public static Clamped clamp(int page, int size) {
    return new Clamped(Math.max(page, 0), Math.min(Math.max(size, 1), MAX_SIZE));
  }
}
