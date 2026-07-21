package com.runrace.backend.notification;

import com.runrace.backend.event.CrewEvents;
import com.runrace.backend.push.service.PushService;
import com.runrace.backend.upload.ImageUploadService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** 크루(가입신청·프로필) 도메인 이벤트 리스너 (푸시 알림 + 리소스 정리). */
@Component
@RequiredArgsConstructor
public class CrewNotifications {
  private final PushService pushService;
  private final ImageUploadService imageUploadService;

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onApplyReceived(CrewEvents.CrewApplyReceived event) {
    pushService.sendLocalized(
        event.leaderId(),
        "crew.apply.received.title",
        "crew.apply.received.body",
        event.applicantNickname(),
        "/crew/settings");
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onApplyApproved(CrewEvents.CrewApplyApproved event) {
    pushService.sendLocalized(
        event.applicantId(),
        "crew.apply.approved.title",
        "crew.apply.approved.body",
        event.crewName(),
        "/crew");
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onApplyRejected(CrewEvents.CrewApplyRejected event) {
    boolean hasReason = event.reason() != null && !event.reason().isBlank();
    if (hasReason) {
      // 2-인자 오버로드는 pushType이 필수 파라미터라 null로 넘겨 이력 저장은 생략한다
      // (크루 대항전 알림군과 동일하게 이 도메인은 발송 이력을 남기지 않는다).
      pushService.sendLocalized(
          event.applicantId(),
          "crew.apply.rejected.title",
          "crew.apply.rejected.body_with_reason",
          event.crewName(),
          event.reason(),
          "/crew",
          null);
    } else {
      pushService.sendLocalized(
          event.applicantId(),
          "crew.apply.rejected.title",
          "crew.apply.rejected.body",
          event.crewName(),
          "/crew");
    }
  }

  /**
   * 크루 프로필 이미지 교체/삭제 후 S3 정리.
   * DB 커밋 이후 처리하여 트랜잭션 내 네트워크 I/O를 방지한다.
   */
  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onCrewImageReplaced(CrewEvents.CrewImageReplacedEvent event) {
    imageUploadService.delete(event.previousImageUrl());
  }
}
