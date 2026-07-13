package com.runrace.backend.auth.service;

import com.runrace.backend.challenge.repository.IndoorRunApprovalRepository;
import com.runrace.backend.crew.service.CrewService;
import com.runrace.backend.fitness.repository.DailyDistanceRepository;
import com.runrace.backend.nudge.repository.NudgeRepository;
import com.runrace.backend.push.repository.DeviceTokenRepository;
import com.runrace.backend.rival.repository.RivalRepository;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import com.runrace.backend.workout.domain.WorkoutSession;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 탈퇴(익명화)의 DB 작업을 하나의 트랜잭션으로 원자적으로 수행한다.
 * 외부 I/O(S3 이미지 삭제·Firebase 계정 삭제)는 트랜잭션 밖에서 호출 측이 처리하도록,
 * 정리에 필요한 값(원래 firebaseUid·삭제할 이미지 URL)만 모아 반환한다.
 */
@Component
@RequiredArgsConstructor
class AccountWithdrawalTx {

  private final AppUserRepository appUserRepository;
  private final WorkoutSessionRepository workoutSessionRepository;
  private final RivalRepository rivalRepository;
  private final NudgeRepository nudgeRepository;
  private final DeviceTokenRepository deviceTokenRepository;
  private final IndoorRunApprovalRepository indoorRunApprovalRepository;
  private final DailyDistanceRepository dailyDistanceRepository;
  private final CrewService crewService;

  /** 정리 작업에 필요한 부수 정보(트랜잭션 밖에서 사용). */
  record WithdrawalCleanup(String firebaseUid, List<String> imageUrls) {}

  @Transactional
  public WithdrawalCleanup anonymize(UUID userId) {
    AppUser user = appUserRepository.getRequired(userId);
    String originalFirebaseUid = user.getFirebaseUid();

    // 1. 운동 기록: 행·집계는 보존, GPS 경로·이미지(개인 위치정보)만 제거. 이미지는 S3 정리용 URL 수집.
    List<WorkoutSession> sessions = workoutSessionRepository.findAllByUserId(userId);
    List<String> imageUrls = sessions.stream()
        .map(WorkoutSession::getImageUrl)
        .filter(Objects::nonNull)
        .toList();
    sessions.forEach(WorkoutSession::scrubPersonalData);
    workoutSessionRepository.saveAll(sessions);

    // 2. 개인·대인 데이터 삭제(레이스 정합성과 무관).
    rivalRepository.deleteAllByUser(userId);
    nudgeRepository.deleteAllByUser(userId);
    deviceTokenRepository.deleteAllByUser(userId);
    indoorRunApprovalRepository.deleteAllByVoter(userId);
    dailyDistanceRepository.deleteAllByUser(userId);
    // 크루 멤버십 정리 — 리더면 승계, 혼자면 크루 삭제 (REQUIRED 전파로 같은 트랜잭션에 합류).
    crewService.removeMembershipForWithdrawal(userId);

    // 3. 계정 익명화 — 개인정보 제거, firebase_uid는 tombstone(재로그인 불가). challenge_member 등은 보존.
    user.withdraw(OffsetDateTime.now());
    appUserRepository.save(user);

    return new WithdrawalCleanup(originalFirebaseUid, imageUrls);
  }
}
