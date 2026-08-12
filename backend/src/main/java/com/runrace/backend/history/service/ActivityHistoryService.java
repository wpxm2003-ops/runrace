package com.runrace.backend.history.service;

import com.runrace.backend.history.domain.ActivityAction;
import com.runrace.backend.history.domain.ActivityTargetType;
import com.runrace.backend.history.domain.UserActivityHistory;
import com.runrace.backend.history.repository.UserActivityHistoryRepository;
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
}
