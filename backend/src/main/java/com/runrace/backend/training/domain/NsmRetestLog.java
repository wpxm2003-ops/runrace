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

/**
 * NSM 재측정 이력(append-only) — 재측정 시점의 vdot·역치·원본 기록을 확정 기록한다.
 * training_plan은 유저당 1행 upsert라 재측정마다 이전 값이 사라지는데, 이 로그가 있어야
 * "직전 재측정 대비 얼마나 빨라졌나" 같은 추이·블록 리포트를 계산할 수 있다.
 */
@Entity
@Table(name = "nsm_retest_log")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class NsmRetestLog {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(name = "vdot", nullable = false)
  private double vdot;

  @Column(name = "threshold_pace_sec", nullable = false)
  private int thresholdPaceSec;

  @Column(name = "source_distance_m", nullable = false)
  private int sourceDistanceM;

  @Column(name = "source_time_sec", nullable = false)
  private int sourceTimeSec;

  @Column(name = "weekly_band")
  private Integer weeklyBand;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  public static NsmRetestLog of(
      UUID userId, double vdot, int thresholdPaceSec,
      int sourceDistanceM, int sourceTimeSec, Integer weeklyBand) {
    NsmRetestLog log = new NsmRetestLog();
    log.userId = userId;
    log.vdot = vdot;
    log.thresholdPaceSec = thresholdPaceSec;
    log.sourceDistanceM = sourceDistanceM;
    log.sourceTimeSec = sourceTimeSec;
    log.weeklyBand = weeklyBand;
    log.createdAt = OffsetDateTime.now();
    return log;
  }

  /**
   * 오타 정정 — 직전 재측정 행을 새 값으로 덮어쓴다(짧은 시간 안의 재저장 한정).
   * append-only 원칙의 유일한 예외: 정정이 별도 재측정으로 쌓이면 0일짜리 블록이 생긴다.
   * createdAt은 최초 입력 시각을 유지한다.
   */
  public void correctTo(
      double vdot, int thresholdPaceSec,
      int sourceDistanceM, int sourceTimeSec, Integer weeklyBand) {
    this.vdot = vdot;
    this.thresholdPaceSec = thresholdPaceSec;
    this.sourceDistanceM = sourceDistanceM;
    this.sourceTimeSec = sourceTimeSec;
    this.weeklyBand = weeklyBand;
  }
}
