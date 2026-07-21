package com.runrace.backend.event;

import java.util.UUID;

/** 크루(가입신청·프로필) 도메인에서 커밋 후 발생하는 이벤트(푸시·정리 발송용). */
public final class CrewEvents {
  private CrewEvents() {}

  /** 가입신청 접수 — 크루 리더에게 알린다. */
  public record CrewApplyReceived(UUID leaderId, String applicantNickname, long crewId) {}

  /** 가입신청 승인 — 신청자에게 알린다. */
  public record CrewApplyApproved(UUID applicantId, String crewName, long crewId) {}

  /** 가입신청 거절 — 신청자에게 알린다. reason은 선택(없으면 null). */
  public record CrewApplyRejected(UUID applicantId, String crewName, String reason, long crewId) {}

  /**
   * 크루 대표 이미지 교체/삭제로 떨어진 기존 이미지 S3 정리.
   * AFTER_COMMIT 리스너에서 처리해 트랜잭션 내 네트워크 I/O(커넥션 점유)를 방지한다.
   */
  public record CrewImageReplacedEvent(String previousImageUrl) {}
}
