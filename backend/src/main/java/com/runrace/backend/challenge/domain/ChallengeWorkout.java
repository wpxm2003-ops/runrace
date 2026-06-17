package com.runrace.backend.challenge.domain;

import com.runrace.backend.user.AppUser;
import com.runrace.backend.workout.WorkoutSession;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "challenge_workout")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class ChallengeWorkout {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "challenge_id", nullable = false)
  private Challenge challenge;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "workout_session_id", nullable = false)
  private WorkoutSession workoutSession;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "user_id", nullable = false)
  private AppUser user;

  @Column(name = "applied_distance_m", nullable = false)
  private int appliedDistanceM;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  @Builder.Default
  @Enumerated(EnumType.STRING)
  @Column(name = "approval_status", nullable = false)
  private ApprovalStatus approvalStatus = ApprovalStatus.APPROVED;

  // ── 도메인 메서드 ──────────────────────────────────────────────

  /** 승인 처리. APPROVED로 전이한다. */
  public void approve() {
    this.approvalStatus = ApprovalStatus.APPROVED;
  }

  /** 거부 처리. REJECTED로 전이한다. */
  public void reject() {
    this.approvalStatus = ApprovalStatus.REJECTED;
  }
}
