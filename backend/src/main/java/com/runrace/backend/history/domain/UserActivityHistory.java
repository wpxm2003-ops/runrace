package com.runrace.backend.history.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "user_activity_history")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserActivityHistory {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "actor_user_id", nullable = false)
  private UUID actorUserId;

  @Column(name = "subject_user_id", nullable = false)
  private UUID subjectUserId;

  @Enumerated(EnumType.STRING)
  @Column(name = "action_type", nullable = false, length = 50)
  private ActivityAction actionType;

  @Enumerated(EnumType.STRING)
  @Column(name = "target_type", nullable = false, length = 30)
  private ActivityTargetType targetType;

  @Column(name = "target_id", nullable = false, length = 64)
  private String targetId;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "metadata", nullable = false, columnDefinition = "jsonb")
  private Map<String, Object> metadata;

  @Column(name = "occurred_at", nullable = false)
  private OffsetDateTime occurredAt;

  public static UserActivityHistory of(
      UUID actorUserId,
      UUID subjectUserId,
      ActivityAction actionType,
      ActivityTargetType targetType,
      Object targetId,
      Map<String, ?> metadata) {
    UserActivityHistory history = new UserActivityHistory();
    history.actorUserId = actorUserId;
    history.subjectUserId = subjectUserId;
    history.actionType = actionType;
    history.targetType = targetType;
    history.targetId = String.valueOf(targetId);
    history.metadata = metadata == null || metadata.isEmpty()
        ? Map.of()
        : new LinkedHashMap<>(metadata);
    history.occurredAt = OffsetDateTime.now();
    return history;
  }
}
