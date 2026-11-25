package com.runrace.backend.auth.service;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.activity.repository.UserDailyActiveRepository;
import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.challenge.repository.IndoorRunApprovalRepository;
import com.runrace.backend.crew.service.CrewService;
import com.runrace.backend.fitness.repository.DailyDistanceRepository;
import com.runrace.backend.history.service.ActivityHistoryService;
import com.runrace.backend.nudge.repository.NudgeRepository;
import com.runrace.backend.push.repository.DeviceTokenRepository;
import com.runrace.backend.rival.repository.RivalRepository;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class AccountWithdrawalTxTest {

  @Mock AppUserRepository appUserRepository;
  @Mock WorkoutSessionRepository workoutSessionRepository;
  @Mock RivalRepository rivalRepository;
  @Mock NudgeRepository nudgeRepository;
  @Mock DeviceTokenRepository deviceTokenRepository;
  @Mock IndoorRunApprovalRepository indoorRunApprovalRepository;
  @Mock ChallengeMemberRepository challengeMemberRepository;
  @Mock DailyDistanceRepository dailyDistanceRepository;
  @Mock UserDailyActiveRepository userDailyActiveRepository;
  @Mock CrewService crewService;
  @Mock ActivityHistoryService activityHistoryService;

  @InjectMocks AccountWithdrawalTx tx;

  /**
   * 방문 기록은 레이스 정합성과 무관해 익명화 예외(운동 기록)에 들지 않는다 — 개인정보처리방침대로
   * 탈퇴 트랜잭션 안에서 지워야 한다.
   */
  @Test
  void deletesDailyActiveRecordsOnWithdrawal() {
    UUID userId = UUID.randomUUID();
    AppUser user = AppUser.builder()
        .id(userId)
        .firebaseUid("firebase-uid")
        .createdAt(OffsetDateTime.parse("2026-11-01T00:00:00Z"))
        .build();
    when(appUserRepository.getRequiredActiveForUpdate(userId)).thenReturn(user);
    when(workoutSessionRepository.findAllByUserId(userId)).thenReturn(List.of());

    tx.anonymize(userId);

    verify(userDailyActiveRepository).deleteAllByUser(userId);
    // 같은 흐름의 기존 정리(일별 거리)도 그대로 돈다.
    verify(dailyDistanceRepository).deleteAllByUser(userId);
  }
}
