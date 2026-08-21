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
   * <p><b>순차 반복만 막는다.</b> 존재 확인과 저장이 한 문장이 아니고 테이블에 이를 강제하는
   * 유니크 제약도 없어서, 동시에 들어온 N개 요청은 모두 "없음"을 읽고 각각 기록할 수 있다.
   * 완전히 막으려면 시간 버킷 컬럼 + 부분 유니크 인덱스(스키마 변경)나 엔드포인트 단위
   * 요청 제한이 필요하다 — 현재는 보존 정책이 증가량의 상한 역할을 한다.
   *
   * <p>같은 이유로 판정 기준이 "사용자 + 행위 + 서버 시각"뿐이라, 창 안에 실제로 다시 시작한
   * 운동은 이력에서 한 번으로 합쳐진다(시작 직후 실수로 끝내고 다시 시작하는 경우).
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
