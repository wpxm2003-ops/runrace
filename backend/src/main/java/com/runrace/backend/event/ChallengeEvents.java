package com.runrace.backend.event;

import java.util.List;

/** 레이스 도메인 Spring 이벤트 모음. */
public final class ChallengeEvents {
  private ChallengeEvents() {}

  /**
   * 레이스 삭제 시 고아가 된 경품 S3 비공개 이미지 키 목록.
   * AFTER_COMMIT 리스너에서 deletePrivate() 호출로 정리한다.
   */
  public record PrizeImagesOrphanedEvent(List<String> imageKeys) {}
}
