package com.runrace.backend.event;

import java.util.List;
import java.util.UUID;
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
   * 레이스 참가자가 목표의 50%를 최초로 달성했을 때 발생(현재 임계값은 50%만 운영).
   * 나머지 미완주 참가자들에게 경고·독려 푸시를 트리거한다.
   */
  public record MilestoneReachedEvent(
      Long challengeId,
      UUID achieverUserId,
      String achieverNickname,
      List<UUID> otherMemberIds) {}

  /** 운동 기록 반영 후 순위가 올라가 다른 참가자를 추월했을 때 — 추월당한 참가자들에게 알림. */
  public record RankOvertakeEvent(
      Long challengeId,
      UUID overtakerUserId,
      String overtakerNickname,
      List<UUID> overtakenUserIds) {}

  /** 레이스가 정상 종료(기간 만료 또는 전원 완주)됐을 때 — 멤버 전원에게 종료/우승 알림. */
  public record ChallengeEndedEvent(Long challengeId, String winnerNickname, List<UUID> memberIds) {}

  /** 참여자가 방장 1명뿐이라 무효 종료된 레이스 — 방장에게 안내 푸시를 보낸다. */
  public record ChallengeEndedNoParticipantsEvent(Long challengeId, UUID creatorUserId) {}

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
