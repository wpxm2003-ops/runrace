package com.runrace.backend.challenge;

import java.time.OffsetDateTime;

public enum ChallengePhase {
  SCHEDULED,
  IN_PROGRESS,
  ENDED;

  public static ChallengePhase of(Challenge c, OffsetDateTime now) {
    if (ChallengeService.isEnded(c, now)) {
      return ENDED;
    }
    if (now.isBefore(c.getStartAt())) {
      return SCHEDULED;
    }
    return IN_PROGRESS;
  }
}
