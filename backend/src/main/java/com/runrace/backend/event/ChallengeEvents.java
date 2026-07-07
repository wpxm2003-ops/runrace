package com.runrace.backend.event;

import java.util.List;
import org.springframework.context.ApplicationEventPublisher;

/** 레이스 도메인 Spring 이벤트 모음. */
public final class ChallengeEvents {
  private ChallengeEvents() {}

  /**
   * 레이스 삭제 시 고아가 된 경품 S3 비공개 이미지 키 목록.
   * AFTER_COMMIT 리스너에서 deletePrivate() 호출로 정리한다.
   */
  public record PrizeImagesOrphanedEvent(List<String> imageKeys) {}

  /**
   * 고아가 된 경품 이미지 키가 있을 때만 정리 이벤트를 발행한다.
   * 레이스 삭제(ChallengeService)·경품 저장(ChallengePrizeService) 양쪽 정리 경로가 공유한다.
   */
  public static void publishPrizeCleanup(ApplicationEventPublisher eventPublisher, List<String> keys) {
    if (!keys.isEmpty()) {
      eventPublisher.publishEvent(new PrizeImagesOrphanedEvent(keys));
    }
  }
}
