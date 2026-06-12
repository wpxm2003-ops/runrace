package com.runrace.backend.challenge;

import java.time.OffsetDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 시간 기반 레이스 상태 전환 배치.
 * 아무도 조회하지 않아도 종료가 확정되도록, 시작됐지만 아직 종료 안 된 레이스를 주기적으로 처리한다.
 * - 방장 혼자(참여자 1명) → 삭제
 * - 기간(endAt) 만료 → 상태 ENDED + 우승자 확정
 *
 * <p>단일 인스턴스 전제(분산 락 없음). 여러 대로 확장 시 ShedLock 등 도입 필요.
 */
@Component
@RequiredArgsConstructor
public class ChallengeScheduler {
  private final ChallengeRepository challengeRepository;
  private final ChallengeService challengeService;

  /** 3분마다 실행. 종료 전환은 급하지 않아 여유 주기로 충분하다. */
  @Scheduled(fixedDelay = 3 * 60 * 1000)
  @Transactional
  public void sweepRaceLifecycle() {
    OffsetDateTime now = OffsetDateTime.now();
    for (Challenge challenge : challengeRepository.findStartedNotEnded(now)) {
      if (challengeService.deleteIfSolo(challenge, now)) {
        continue; // 방장 혼자면 삭제하고 다음으로
      }
      challengeService.finalizeIfTimeEnded(challenge, now); // 기간 만료면 확정
    }
  }
}
