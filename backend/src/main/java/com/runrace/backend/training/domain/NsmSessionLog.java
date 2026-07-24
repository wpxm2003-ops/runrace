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
 * NSM sub-T 세션 수행 로그(append-only).
 * training_plan은 유저당 1행 upsert라 요일을 바꾸면 과거 스케줄이 사라지고 취소하면 행이 삭제된다.
 * 수행 시점에만 알 수 있는 사실(어떤 세션을, 어떤 처방으로, 끝까지 했는지)을 여기 확정 기록한다.
 */
@Entity
@Table(name = "nsm_session_log")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class NsmSessionLog {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  /** 이 세션을 채운 운동 기록(soft 참조). */
  @Column(name = "workout_id")
  private Long workoutId;

  /** 0=월 … 6=일. */
  @Column(name = "session_day", nullable = false)
  private short sessionDay;

  /** SHORT / MEDIUM / LONG. */
  @Column(name = "session_kind", nullable = false, length = 10)
  private String sessionKind;

  @Column(name = "target_pace_sec")
  private Integer targetPaceSec;

  @Column(name = "reps_planned")
  private Integer repsPlanned;

  @Column(name = "reps_done")
  private Integer repsDone;

  /** 렙 가이드를 끝까지 완료했는지. false = 해당 요일에 뛰었으나 세션 미완주. */
  @Column(name = "completed", nullable = false)
  private boolean completed;

  @Column(name = "completed_at", nullable = false)
  private OffsetDateTime completedAt;

  public static NsmSessionLog of(
      UUID userId, Long workoutId, int sessionDay, String sessionKind,
      Integer targetPaceSec, Integer repsPlanned, Integer repsDone, boolean completed) {
    NsmSessionLog log = new NsmSessionLog();
    log.userId = userId;
    log.workoutId = workoutId;
    log.sessionDay = (short) sessionDay;
    log.sessionKind = sessionKind;
    log.targetPaceSec = targetPaceSec;
    log.repsPlanned = repsPlanned;
    log.repsDone = repsDone;
    log.completed = completed;
    log.completedAt = OffsetDateTime.now();
    return log;
  }
}
