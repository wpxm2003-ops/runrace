package com.runrace.backend.goal.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 개인 주간 목표 — 사용자당 1개, 매주 반복된다. 저장·달성 표시는 경합에 안전하도록
 * {@code WeeklyGoalRepository}의 네이티브 upsert/조건부 update로만 바꾼다(엔티티는 조회용).
 */
@Entity
@Table(name = "user_weekly_goal")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class WeeklyGoal {

  @Id
  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Enumerated(EnumType.STRING)
  @Column(name = "goal_type", nullable = false, length = 16)
  private WeeklyGoalType goalType;

  /** DISTANCE면 미터, RUNS면 횟수. */
  @Column(name = "target_value", nullable = false)
  private int targetValue;

  /** 달성 축하를 마지막으로 띄운 주의 월요일. 아직 없으면 null. */
  @Column(name = "last_achieved_week")
  private LocalDate lastAchievedWeek;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  @Column(name = "updated_at", nullable = false)
  private OffsetDateTime updatedAt;
}
