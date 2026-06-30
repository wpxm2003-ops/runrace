package com.runrace.backend.notification;

import com.runrace.backend.event.WorkoutEvents;
import com.runrace.backend.push.repository.SystemPushHistoryRepository;
import com.runrace.backend.push.service.PushService;
import com.runrace.backend.rival.repository.RivalRepository;
import com.runrace.backend.upload.ImageUploadService;
import java.time.OffsetDateTime;
import java.util.concurrent.ThreadLocalRandom;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** 운동 도메인 이벤트 리스너 (푸시 알림 + 리소스 정리). */
@Component
@RequiredArgsConstructor
public class WorkoutNotifications {

  private static final int RIVAL_VARIANTS = 5;

  private final PushService pushService;
  private final ImageUploadService imageUploadService;
  private final RivalRepository rivalRepository;
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
    if (toNotify.isEmpty()) return;

    String distanceKm = String.format("%.1f", event.distanceM() / 1000.0);
    String pushType = "rival_workout:" + event.userId();
    OffsetDateTime todayStart = OffsetDateTime.now().withHour(0).withMinute(0).withSecond(0).withNano(0);
    String bodyKey = "rival.workout." + ThreadLocalRandom.current().nextInt(RIVAL_VARIANTS);

    for (var userId : toNotify) {
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
