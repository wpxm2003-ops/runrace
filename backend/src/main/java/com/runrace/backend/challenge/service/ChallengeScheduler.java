package com.runrace.backend.challenge.service;

import com.runrace.backend.challenge.repository.ChallengeRepository;
import com.runrace.backend.common.KstTime;
import com.runrace.backend.observability.service.ErrorLogService;
import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

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
  private static final Logger log = LoggerFactory.getLogger(ChallengeScheduler.class);

  private static final ZoneId KST = KstTime.ZONE;
  /** 온램프 레이스 정원 — 상한(MAX_MEMBERS_LIMIT)과 동일하게 넉넉히. */
  private static final int OPEN_RACE_MAX_MEMBERS = 50;
  /** 주말(2일) 목표. */
  private static final BigDecimal WEEKEND_GOAL_KM = BigDecimal.valueOf(10);
  /** 평일(5일) 목표 — 기간이 길어 주말보다 높게. */
  private static final BigDecimal WEEKDAY_GOAL_KM = BigDecimal.valueOf(30);

  /**
   * 온램프 레이스의 방장이 될 운영자 계정.
   * 임시로 코드에 고정한다 — 운영자가 바뀌거나 기능을 접으면 이 상수만 지우면 된다.
   */
  private static final UUID AUTO_RACE_CREATOR_USER_ID =
      UUID.fromString("662963bb-41f8-4180-92de-ecf02a8b3ba7");

  private final ChallengeRepository challengeRepository;
  private final ChallengeService challengeService;
  private final ErrorLogService errorLogService;

  /** 3분마다 실행. 종료 전환은 급하지 않아 여유 주기로 충분하다. */
  @Scheduled(fixedDelay = 3 * 60 * 1000)
  public void sweepRaceLifecycle() {
    OffsetDateTime now = OffsetDateTime.now();
    // 레이스별 독립 트랜잭션 — 한 건이 실패해도 나머지는 정상 처리되도록 격리한다.
    for (Long challengeId : challengeRepository.findStartedNotEndedIds(now)) {
      try {
        challengeService.processRaceLifecycle(challengeId, now);
      } catch (Exception e) {
        log.warn("레이스 생명주기 처리 실패 (challengeId={}) — 건너뜀", challengeId, e);
        errorLogService.recordServiceError(
            "scheduler", e.getClass().getSimpleName(), e.getMessage(),
            ErrorLogService.stackTraceOf(e), "challengeId=" + challengeId);
      }
    }
  }

  /**
   * 공개 레이스 자동 보충 — 신규 유저의 온램프.
   *
   * <p>시작한 레이스에는 참가할 수 없으므로(joinRoom의 ensureNotStarted), "진행 중"인 레이스만 있으면
   * 신규 가입자는 참가할 게 없다. 그래서 <b>모집 중(미시작) 공개 레이스가 0개일 때만</b> 다음 회차를 연다.
   *
   * <p>회차는 요일로 엇갈린다 — 평일에는 이번 주말(토~일) 레이스를, 주말에는 다음 평일(월~금) 레이스를
   * 만들어, 언제 가입해도 모집 중인 레이스가 최소 하나 존재하게 한다.
   *
   * <p>생성 후 아무도 참가하지 않으면 시작 시점에 solo 규칙으로 정리되고, 다음 실행이 새 회차를 연다.
   * 하루 1회로 충분하다(3분 주기 스윕에 얹으면 불필요한 조회만 늘어난다).
   */
  @Scheduled(cron = "0 0 4 * * *", zone = "Asia/Seoul")
  public void ensureOpenPublicRace() {
    try {
      OffsetDateTime now = OffsetDateTime.now();
      if (challengeRepository.existsOpenPublicRace(now)) return; // 이미 모집 중인 게 있으면 유지

      OnrampWindow w = nextOnrampWindow(LocalDate.now(KST));

      OffsetDateTime startAt = w.startDay().atStartOfDay(KST).toOffsetDateTime();
      OffsetDateTime endAt = w.endDay().atTime(23, 59, 59).atZone(KST).toOffsetDateTime();

      challengeService.createOfficialRace(
          AUTO_RACE_CREATOR_USER_ID, w.title(), w.goalKm(), OPEN_RACE_MAX_MEMBERS, startAt, endAt);
      log.info("공개 온램프 레이스 생성 — {} ({} ~ {})", w.title(), startAt, endAt);
    } catch (Exception e) {
      log.warn("공개 레이스 자동 보충 실패 — 건너뜀", e);
      errorLogService.recordServiceError(
          "scheduler", e.getClass().getSimpleName(), e.getMessage(),
          ErrorLogService.stackTraceOf(e), "ensureOpenPublicRace");
    }
  }

  /** 다음 온램프 회차(시작일·종료일·라벨·목표·제목). */
  record OnrampWindow(
      LocalDate startDay, LocalDate endDay, String label, BigDecimal goalKm, String title) {}

  /**
   * 오늘 요일로 다음 회차를 정한다 — 평일이면 이번 주말(토~일), 주말이면 다음 평일(월~금).
   * 두 회차가 엇갈려 돌아 언제나 "모집 중"인 레이스가 하나 존재하게 된다.
   * 시작일은 항상 오늘보다 미래라 RaceRules의 "과거 시작 금지"를 만족한다.
   * 시각 의존을 없애 테스트 가능하도록 순수 계산으로 분리했다.
   */
  static OnrampWindow nextOnrampWindow(LocalDate today) {
    DayOfWeek dow = today.getDayOfWeek();
    boolean isWeekendToday = dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY;

    LocalDate startDay = isWeekendToday
        ? today.with(TemporalAdjusters.next(DayOfWeek.MONDAY))
        : today.with(TemporalAdjusters.nextOrSame(DayOfWeek.SATURDAY));
    LocalDate endDay = isWeekendToday ? startDay.plusDays(4) : startDay.plusDays(1);

    String label = isWeekendToday ? "평일" : "주말";
    // 날짜만 있으면 무슨 날인지 모호해 "start"를 붙여 시작일임을 드러낸다.
    String title = String.format(
        "%s 아무나 레이스 %d/%d start!!", label, startDay.getMonthValue(), startDay.getDayOfMonth());

    return new OnrampWindow(
        startDay,
        endDay,
        label,
        isWeekendToday ? WEEKDAY_GOAL_KM : WEEKEND_GOAL_KM,
        title);
  }
}
