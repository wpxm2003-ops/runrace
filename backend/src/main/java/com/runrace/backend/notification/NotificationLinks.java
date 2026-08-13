package com.runrace.backend.notification;

/** 푸시 딥링크 경로의 단일 출처 — 리스너마다 리터럴을 재작성하지 않는다. */
final class NotificationLinks {
  private NotificationLinks() {}

  /** 레이스 상세. id가 없으면 링크 없음(null). */
  static String challengeLink(Long challengeId) {
    return challengeId == null ? null : "/challenges/" + challengeId;
  }

  /** 크루 대항전 상세. */
  static String matchLink(long matchId) {
    return "/crew/match?id=" + matchId;
  }
}
