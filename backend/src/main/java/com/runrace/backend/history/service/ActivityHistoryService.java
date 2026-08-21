package com.runrace.backend.history.service;

import com.runrace.backend.history.domain.ActivityAction;
import com.runrace.backend.history.domain.ActivityTargetType;
import com.runrace.backend.history.domain.UserActivityHistory;
import com.runrace.backend.history.repository.UserActivityHistoryRepository;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ActivityHistoryService {
  private final UserActivityHistoryRepository repository;

  public void record(
      UUID actorUserId,
      UUID subjectUserId,
      ActivityAction action,
      ActivityTargetType targetType,
      Object targetId,
      Map<String, ?> metadata) {
    repository.save(UserActivityHistory.of(
        actorUserId, subjectUserId, action, targetType, targetId, metadata));
  }

  public void recordSelf(
      UUID userId,
      ActivityAction action,
      ActivityTargetType targetType,
      Object targetId) {
    record(userId, userId, action, targetType, targetId, Map.of());
  }

  public void recordSelf(
      UUID userId,
      ActivityAction action,
      ActivityTargetType targetType,
      Object targetId,
      Map<String, ?> metadata) {
    record(userId, userId, action, targetType, targetId, metadata);
  }

  /**
   * 최근 {@code window} 안에 같은 행위를 남긴 적이 없을 때만 기록한다.
   *
   * <p>클라이언트가 부르는 대로 행이 쌓이는 엔드포인트를 위한 것이다. 운동 시작처럼
   * 서버가 검증할 대상 엔티티가 아직 없는 행위는 멱등 키를 만들 수 없어, 인증된 사용자
   * 한 명이 반복 호출하는 것만으로 이력 테이블과 운영 화면을 채울 수 있었다.
   *
   * @return 실제로 기록했으면 true, 중복이라 건너뛰었으면 false
   */
  public boolean recordSelfOnce(
      UUID userId,
      ActivityAction action,
      ActivityTargetType targetType,
      Object targetId,
      Duration window) {
    OffsetDateTime since = OffsetDateTime.now().minus(window);
    if (repository.existsByActorUserIdAndActionTypeAndOccurredAtAfter(userId, action, since)) {
      return false;
    }
    record(userId, userId, action, targetType, targetId, Map.of());
    return true;
  }
}
