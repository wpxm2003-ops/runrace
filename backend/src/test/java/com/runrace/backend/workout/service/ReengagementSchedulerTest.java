package com.runrace.backend.workout.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.common.KstTime;
import com.runrace.backend.observability.service.ErrorLogService;
import com.runrace.backend.push.repository.SystemPushHistoryRepository;
import com.runrace.backend.push.service.PushService;
import com.runrace.backend.user.repository.AppUserRepository;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import com.runrace.backend.workout.repository.WorkoutSessionRepository.ReengageCandidate;
import com.runrace.backend.workout.repository.WorkoutSessionRepository.UserLastWorkoutDate;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ReengagementSchedulerTest {

  @Mock WorkoutSessionRepository workoutSessionRepository;
  @Mock AppUserRepository appUserRepository;
  @Mock SystemPushHistoryRepository systemPushHistoryRepository;
  @Mock PushService pushService;
  @Mock ErrorLogService errorLogService;

  @InjectMocks ReengagementScheduler scheduler;

  private final LocalDate today = LocalDate.now(KstTime.ZONE);

  private UserLastWorkoutDate lastWorkout(UUID userId, LocalDate lastDate) {
    return new UserLastWorkoutDate() {
      public UUID getUserId() { return userId; }
      public LocalDate getLastDate() { return lastDate; }
    };
  }

  private ReengageCandidate streakCandidate(UUID userId, LocalDate lastDate, int streak) {
    return new ReengageCandidate() {
      public UUID getUserId() { return userId; }
      public LocalDate getLastDate() { return lastDate; }
      public int getCurrentStreak() { return streak; }
    };
  }

  // ── sendInactivityPushes ─────────────────────────────────────────

  @Nested class SendInactivityPushes {
    @Test void 삼일째면_inactive3_발송() {
      UUID userId = UUID.randomUUID();
      when(workoutSessionRepository.findActiveUserLastDates(any()))
          .thenReturn(List.of(lastWorkout(userId, today.minusDays(3))));
      when(appUserRepository.findInactiveSignups(any())).thenReturn(List.of());

      scheduler.sendInactivityPushes();

      verify(pushService).sendLocalized(
          eq(userId), eq("reengage.inactive.title"), eq("reengage.inactive3.body"),
          eq((String) null), eq("/workout/indoor"), eq("inactive3"));
    }

    @Test void 칠일째면_inactive7_발송() {
      UUID userId = UUID.randomUUID();
      when(workoutSessionRepository.findActiveUserLastDates(any()))
          .thenReturn(List.of(lastWorkout(userId, today.minusDays(7))));
      when(appUserRepository.findInactiveSignups(any())).thenReturn(List.of());

      scheduler.sendInactivityPushes();

      verify(pushService).sendLocalized(
          eq(userId), eq("reengage.inactive.title"), eq("reengage.inactive7.body"),
          eq((String) null), eq("/workout/indoor"), eq("inactive7"));
    }

    @Test void 그외경과일이면_발송안함() {
      UUID userId = UUID.randomUUID();
      when(workoutSessionRepository.findActiveUserLastDates(any()))
          .thenReturn(List.of(lastWorkout(userId, today.minusDays(5))));
      when(appUserRepository.findInactiveSignups(any())).thenReturn(List.of());

      scheduler.sendInactivityPushes();

      verify(pushService, never()).sendLocalized(any(), any(), any(), any(), any(), any());
    }

    @Test void 주간한도_도달하면_발송안함() {
      UUID userId = UUID.randomUUID();
      when(workoutSessionRepository.findActiveUserLastDates(any()))
          .thenReturn(List.of(lastWorkout(userId, today.minusDays(3))));
      when(appUserRepository.findInactiveSignups(any())).thenReturn(List.of());
      when(systemPushHistoryRepository.countByUserAndTypes(eq(userId), anyList(), any())).thenReturn(2L);

      scheduler.sendInactivityPushes();

      verify(pushService, never()).sendLocalized(any(), any(), any(), any(), any(), any());
    }

    @Test void 신규가입_미운동이면_onboarding_발송() {
      UUID userId = UUID.randomUUID();
      when(workoutSessionRepository.findActiveUserLastDates(any())).thenReturn(List.of());
      when(appUserRepository.findInactiveSignups(any())).thenReturn(List.of(userId));

      scheduler.sendInactivityPushes();

      verify(pushService).sendLocalized(
          eq(userId), eq("reengage.onboarding.title"), eq("reengage.onboarding.body"),
          eq((String) null), eq("/workout/indoor"), eq("onboarding"));
    }

    @Test void 신규가입자도_주간한도차면_발송안함() {
      UUID userId = UUID.randomUUID();
      when(workoutSessionRepository.findActiveUserLastDates(any())).thenReturn(List.of());
      when(appUserRepository.findInactiveSignups(any())).thenReturn(List.of(userId));
      when(systemPushHistoryRepository.countByUserAndTypes(eq(userId), anyList(), any())).thenReturn(2L);

      scheduler.sendInactivityPushes();

      verify(pushService, never()).sendLocalized(any(), any(), any(), any(), any(), any());
    }

    @Test void 한사용자_실패해도_나머지계속처리되고_에러로그남음() {
      UUID failing = UUID.randomUUID();
      UUID ok = UUID.randomUUID();
      when(workoutSessionRepository.findActiveUserLastDates(any())).thenReturn(List.of(
          lastWorkout(failing, today.minusDays(3)),
          lastWorkout(ok, today.minusDays(7))));
      when(appUserRepository.findInactiveSignups(any())).thenReturn(List.of());
      doThrow(new RuntimeException("boom")).when(pushService).sendLocalized(
          eq(failing), any(), any(), any(), any(), any());

      scheduler.sendInactivityPushes();

      verify(pushService).sendLocalized(
          eq(ok), eq("reengage.inactive.title"), eq("reengage.inactive7.body"),
          eq((String) null), eq("/workout/indoor"), eq("inactive7"));
      verify(errorLogService).recordServiceError(
          eq("reengage"), eq("RuntimeException"), eq("boom"), any(), eq("userId=" + failing));
    }
  }

  // ── sendStreakRiskPushes ─────────────────────────────────────────

  @Nested class SendStreakRiskPushes {
    @Test void 어제운동_연속5일이상이면_발송() {
      UUID userId = UUID.randomUUID();
      when(workoutSessionRepository.findReengageCandidates(any()))
          .thenReturn(List.of(streakCandidate(userId, today.minusDays(1), 5)));

      scheduler.sendStreakRiskPushes();

      verify(pushService).sendLocalized(
          eq(userId), eq("reengage.streak_risk.title"), eq("reengage.streak_risk.body"),
          eq("5"), eq("/workout/indoor"), eq("streak_risk"));
    }

    @Test void 연속일수5미만이면_발송안함() {
      UUID userId = UUID.randomUUID();
      when(workoutSessionRepository.findReengageCandidates(any()))
          .thenReturn(List.of(streakCandidate(userId, today.minusDays(1), 4)));

      scheduler.sendStreakRiskPushes();

      verify(pushService, never()).sendLocalized(any(), any(), any(), any(), any(), any());
    }

    @Test void 오늘이미운동했으면_daysSince0이라_발송안함() {
      UUID userId = UUID.randomUUID();
      when(workoutSessionRepository.findReengageCandidates(any()))
          .thenReturn(List.of(streakCandidate(userId, today, 10)));

      scheduler.sendStreakRiskPushes();

      verify(pushService, never()).sendLocalized(any(), any(), any(), any(), any(), any());
    }

    @Test void 한사용자_실패해도_나머지계속처리() {
      UUID failing = UUID.randomUUID();
      UUID ok = UUID.randomUUID();
      when(workoutSessionRepository.findReengageCandidates(any())).thenReturn(List.of(
          streakCandidate(failing, today.minusDays(1), 5),
          streakCandidate(ok, today.minusDays(1), 8)));
      doThrow(new RuntimeException("boom")).when(pushService).sendLocalized(
          eq(failing), any(), any(), any(), any(), any());

      scheduler.sendStreakRiskPushes();

      verify(pushService, times(1)).sendLocalized(
          eq(ok), any(), any(), any(), any(), any());
      verify(errorLogService).recordServiceError(
          eq("reengage"), eq("RuntimeException"), eq("boom"), any(), eq("userId=" + failing));
    }
  }
}
