package com.runrace.backend.notification;

import com.runrace.backend.event.WorkoutEvents;
import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.push.repository.SystemPushHistoryRepository;
import com.runrace.backend.push.service.PushService;
import com.runrace.backend.rival.repository.RivalRepository;
import com.runrace.backend.upload.ImageUploadService;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** 운동 도메인 이벤트 리스너 (푸시 알림 + 리소스 정리). */
@Component
@RequiredArgsConstructor
public class WorkoutNotifications {

  private static final int RIVAL_VARIANTS = 5;
  private static final int DAILY_RACE_NOTIFICATION_LIMIT = 3;
  private static final String RACE_WORKOUT_PUSH_TYPE = "race_workout";

  private final PushService pushService;
  private final ImageUploadService imageUploadService;
  private final RivalRepository rivalRepository;
  private final ChallengeMemberRepository challengeMemberRepository;
  private final SystemPushHistoryRepository systemPushHistoryRepository;

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onIndoorRunPendingApproval(WorkoutEvents.IndoorRunPendingApprovalEvent event) {
    String name = event.submitterNickname() != null ? event.submitterNickname() : "";
    String link = "/challenges/" + event.challengeId();
    for (java.util.UUID voterId : event.voterUserIds()) {
      pushService.sendLocalized(
          voterId, "workout.approval_request.title", "workout.approval_request.body", name, link);
    }
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onIndoorRunApproved(WorkoutEvents.IndoorRunApprovedEvent event) {
    pushService.sendLocalized(
        event.submitterUserId(), "workout.approved.title", "workout.approved.body", null);
  }

  /**
   * 라이벌이 운동을 완료하면 해당 사람을 라이벌로 등록한 유저들에게 도발 푸시를 보낸다.
   * 같은 라이벌의 알림은 하루 1회로 제한한다.
   */
  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onWorkoutSaved(WorkoutEvents.WorkoutSavedEvent event) {
    var toNotify = rivalRepository.findUserIdsWhoHaveMeAsRival(event.userId());
    String distanceKm = String.format("%.1f", event.distanceM() / 1000.0);
    OffsetDateTime now = OffsetDateTime.now();
    OffsetDateTime todayStart = now.withHour(0).withMinute(0).withSecond(0).withNano(0);

    // 여러 레이스를 함께 뛰더라도 같은 운동으로 수신자에게 푸시는 한 번만 보낸다.
    Map<java.util.UUID, Long> sharedRaceByUser = new LinkedHashMap<>();
    challengeMemberRepository.findSharedActiveRaceParticipants(event.userId(), now)
        .forEach(row -> sharedRaceByUser.putIfAbsent(row.userId(), row.challengeId()));

    for (var entry : sharedRaceByUser.entrySet()) {
      long sentToday = systemPushHistoryRepository.countByUserIdAndPushTypeAndSentAtAfter(
          entry.getKey(), RACE_WORKOUT_PUSH_TYPE, todayStart);
      if (sentToday >= DAILY_RACE_NOTIFICATION_LIMIT) continue;

      String bodyKey = sentToday == DAILY_RACE_NOTIFICATION_LIMIT - 1
          ? "race.workout.last"
          : "race.workout.body";
      pushService.sendLocalized(entry.getKey(), "race.workout.title", bodyKey,
          event.nickname(), distanceKm, "/challenges/" + entry.getValue(), RACE_WORKOUT_PUSH_TYPE);
    }

    if (toNotify.isEmpty()) return;
    String pushType = "rival_workout:" + event.userId();
    String bodyKey = NotificationVariants.randomKey("rival.workout.", RIVAL_VARIANTS);

    for (var userId : toNotify) {
      // 같은 진행 중 레이스 참가자는 레이스 알림 대상이므로 라이벌 알림을 중복 발송하지 않는다.
      // 일일 3회 한도에 도달한 뒤에도 라이벌 알림으로 우회하지 않는다.
      if (sharedRaceByUser.containsKey(userId)) continue;
      if (systemPushHistoryRepository.existsByUserIdAndPushTypeAndSentAtAfter(userId, pushType, todayStart)) {
        continue;
      }
      pushService.sendLocalized(userId, "rival.workout.title", bodyKey,
          event.nickname(), distanceKm, "/rivals", pushType);
    }
  }

  /**
   * 활성 신발이 교체 목표 거리에 도달하면 소유자에게 교체 권장 푸시를 보낸다.
   * 같은 신발에 대해서는 1회만 발송한다.
   */
  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onShoeReplacementDue(WorkoutEvents.ShoeReplacementDueEvent event) {
    String pushType = "shoe_replace:" + event.shoeId();
    if (systemPushHistoryRepository.existsByUserIdAndPushType(event.userId(), pushType)) return;
    pushService.sendLocalized(event.userId(), "shoe.replace.title", "shoe.replace.body",
        event.shoeName(), event.totalKm(), "/shoes", pushType);
  }

  /**
   * 운동 삭제 후 S3 이미지 정리.
   * DB 커밋 이후 처리하여 트랜잭션 내 네트워크 I/O를 방지한다.
   */
  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onWorkoutImageDeleted(WorkoutEvents.WorkoutImageDeletedEvent event) {
    // delete가 내부에서 실패를 로깅·삼키므로 호출부 try/catch 불필요.
    imageUploadService.delete(event.imageUrl());
  }
}
