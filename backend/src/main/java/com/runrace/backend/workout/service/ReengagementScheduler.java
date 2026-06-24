package com.runrace.backend.workout.service;

import com.runrace.backend.observability.service.ErrorLogService;
import com.runrace.backend.push.service.PushService;
import com.runrace.backend.user.repository.AppUserRepository;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import com.runrace.backend.workout.repository.WorkoutSessionRepository.ReengageCandidate;
import com.runrace.backend.workout.repository.WorkoutSessionRepository.UserLastWorkoutDate;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 재참여(리텐션) 푸시 배치. 매일 두 차례(KST) 실행되며, 마지막 운동일로부터의 경과일에 따라
 * 본인 활동 기반의 부담 없는 알림을 보낸다. 별도 발송 이력 테이블 없이 "경과일 == N" 조건으로
 * 발송 주기를 자연 제한한다(스팸 방지).
 *
 * <ul>
 *   <li>신규 활성화(17:00) — 가입 3일째까지 운동 0건이면 첫 러닝 유도</li>
 *   <li>휴식 알림(17:00) — 3일째 가벼운 복귀 유도 / 7일째 마지막 복귀 유도(이후 휴면 유저는 미발송)</li>
 *   <li>스트릭 위험(20:00) — 어제까지 연속 5일↑인데 오늘 미운동 시 손실 회피 알림</li>
 * </ul>
 *
 * <p>그 외 경과일(오늘 운동함·2·4·5·6일째·8일 이상)은 발송하지 않는다. 단일 인스턴스 전제(분산 락 없음).
 */
@Component
@RequiredArgsConstructor
public class ReengagementScheduler {
  private static final Logger log = LoggerFactory.getLogger(ReengagementScheduler.class);
  private static final ZoneId KST = ZoneId.of("Asia/Seoul");
  /** 운동 유도 푸시 탭 시 실내러닝 등록 화면으로 보낸다. */
  private static final String LINK_INDOOR = "/workout/indoor";
  /** 스트릭 위험 알림을 보낼 최소 연속일(짧은 연속은 알림 가치가 낮아 제외). */
  private static final int MIN_STREAK_FOR_RISK = 5;

  private final WorkoutSessionRepository workoutSessionRepository;
  private final AppUserRepository appUserRepository;
  private final PushService pushService;
  private final ErrorLogService errorLogService;

  /** 휴식 복귀 유도 + 신규 가입자 활성화 — 매일 17:00 (Asia/Seoul). */
  @Scheduled(cron = "0 0 17 * * *", zone = "Asia/Seoul")
  public void sendInactivityPushes() {
    LocalDate today = LocalDate.now(KST);

    // 기존 운동자: 3·7일째 복귀 유도. 8일 이상 휴면 유저는 후보에서 제외.
    for (UserLastWorkoutDate c : workoutSessionRepository.findActiveUserLastDates(today.minusDays(7))) {
      forEachSafely(c.getUserId(), () -> {
        long daysSince = ChronoUnit.DAYS.between(c.getLastDate(), today);
        if (daysSince == 3) {
          pushService.sendLocalized(
              c.getUserId(), "reengage.inactive.title", "reengage.inactive3.body", null, LINK_INDOOR);
        } else if (daysSince == 7) {
          pushService.sendLocalized(
              c.getUserId(), "reengage.inactive.title", "reengage.inactive7.body", null, LINK_INDOOR);
        }
      });
    }

    // 신규 가입자: 가입 3일째까지 운동 0건이면 첫 러닝 유도(1회).
    for (UUID userId : appUserRepository.findInactiveSignups(today.minusDays(3))) {
      forEachSafely(userId, () ->
          pushService.sendLocalized(
              userId, "reengage.onboarding.title", "reengage.onboarding.body", null, LINK_INDOOR));
    }
  }

  /** 스트릭 위험 — 매일 20:00 (Asia/Seoul). 잠들기 전 마지막 유도. */
  @Scheduled(cron = "0 0 20 * * *", zone = "Asia/Seoul")
  public void sendStreakRiskPushes() {
    LocalDate today = LocalDate.now(KST);
    // 어제 운동한 유저만 후보(오늘 미운동 시 스트릭이 끊길 위험).
    for (ReengageCandidate c : workoutSessionRepository.findReengageCandidates(today.minusDays(1))) {
      forEachSafely(c.getUserId(), () -> {
        long daysSince = ChronoUnit.DAYS.between(c.getLastDate(), today);
        if (daysSince == 1 && c.getCurrentStreak() >= MIN_STREAK_FOR_RISK) {
          pushService.sendLocalized(
              c.getUserId(), "reengage.streak_risk.title", "reengage.streak_risk.body",
              String.valueOf(c.getCurrentStreak()), LINK_INDOOR);
        }
      });
    }
  }

  /** 한 사용자 발송 실패가 배치 전체를 중단시키지 않도록 격리한다. */
  private void forEachSafely(UUID userId, Runnable send) {
    try {
      send.run();
    } catch (Exception e) {
      log.warn("재참여 푸시 실패 (userId={}) — 건너뜀", userId, e);
      errorLogService.recordServiceError(
          "reengage", e.getClass().getSimpleName(), e.getMessage(),
          ErrorLogService.stackTraceOf(e), "userId=" + userId);
    }
  }
}
