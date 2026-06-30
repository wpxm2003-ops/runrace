package com.runrace.backend.training.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** NSM 훈련 플랜 — 사용자당 1개. 주간 스케줄은 threshold + sessionsPerWeek로 프론트가 결정적 생성. */
@Entity
@Table(name = "training_plan")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TrainingPlan {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(name = "vdot", nullable = false)
  private double vdot;

  @Column(name = "threshold_pace_sec", nullable = false)
  private int thresholdPaceSec;

  @Column(name = "sessions_per_week", nullable = false)
  private int sessionsPerWeek;

  /** sub-T 요일 CSV (월=0 … 일=6), 예: "1,3,5". */
  @Column(name = "sub_t_days", nullable = false, length = 20)
  private String subTDays;

  @Column(name = "source_distance_m", nullable = false)
  private int sourceDistanceM;

  @Column(name = "source_time_sec", nullable = false)
  private int sourceTimeSec;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  @Column(name = "updated_at", nullable = false)
  private OffsetDateTime updatedAt;

  public static TrainingPlan of(
      UUID userId, double vdot, int thresholdPaceSec, String subTDays,
      int sourceDistanceM, int sourceTimeSec) {
    TrainingPlan p = new TrainingPlan();
    p.userId = userId;
    p.vdot = vdot;
    p.thresholdPaceSec = thresholdPaceSec;
    p.subTDays = subTDays;
    p.sessionsPerWeek = countDays(subTDays);
    p.sourceDistanceM = sourceDistanceM;
    p.sourceTimeSec = sourceTimeSec;
    p.createdAt = OffsetDateTime.now();
    p.updatedAt = p.createdAt;
    return p;
  }

  public void update(
      double vdot, int thresholdPaceSec, String subTDays,
      int sourceDistanceM, int sourceTimeSec) {
    this.vdot = vdot;
    this.thresholdPaceSec = thresholdPaceSec;
    this.subTDays = subTDays;
    this.sessionsPerWeek = countDays(subTDays);
    this.sourceDistanceM = sourceDistanceM;
    this.sourceTimeSec = sourceTimeSec;
    this.updatedAt = OffsetDateTime.now();
  }

  private static int countDays(String csv) {
    if (csv == null || csv.isBlank()) return 0;
    return csv.split(",").length;
  }
}
