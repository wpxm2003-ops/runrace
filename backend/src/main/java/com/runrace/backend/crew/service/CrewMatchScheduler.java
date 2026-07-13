package com.runrace.backend.crew.service;

import com.runrace.backend.crew.repository.CrewMatchRepository;
import com.runrace.backend.observability.service.ErrorLogService;
import java.time.OffsetDateTime;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 시간 기반 크루 대항전 종료 확정 배치.
 * 아무도 조회하지 않아도 종료가 확정되고 결과 푸시가 나가도록, 기간(endAt)이 지났지만
 * 아직 확정 안 된 ACCEPTED 매치를 주기적으로 처리한다.
 *
 * <p>단일 인스턴스 전제(분산 락 없음). 여러 대로 확장 시 ShedLock 등 도입 필요.
 */
@Component
@RequiredArgsConstructor
public class CrewMatchScheduler {
  private static final Logger log = LoggerFactory.getLogger(CrewMatchScheduler.class);

  private final CrewMatchRepository crewMatchRepository;
  private final CrewMatchService crewMatchService;
  private final ErrorLogService errorLogService;

  /** 3분마다 실행. 종료 확정은 급하지 않아 여유 주기로 충분하다(ChallengeScheduler와 동일 주기). */
  @Scheduled(fixedDelay = 3 * 60 * 1000)
  public void sweepEndedMatches() {
    OffsetDateTime now = OffsetDateTime.now();
    // 매치별 독립 트랜잭션 — 한 건이 실패해도 나머지는 정상 처리되도록 격리한다.
    for (Long matchId : crewMatchRepository.findAcceptedNotEndedIds(now)) {
      try {
        crewMatchService.finalizeIfTimeEnded(matchId, now);
      } catch (Exception e) {
        log.warn("크루 대항전 종료 확정 실패 (matchId={}) — 건너뜀", matchId, e);
        errorLogService.recordServiceError(
            "scheduler", e.getClass().getSimpleName(), e.getMessage(),
            ErrorLogService.stackTraceOf(e), "crewMatchId=" + matchId);
      }
    }
  }
}
