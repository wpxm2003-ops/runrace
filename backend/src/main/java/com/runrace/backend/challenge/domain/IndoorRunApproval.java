package com.runrace.backend.challenge.domain;

import com.runrace.backend.user.domain.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
@Table(name = "indoor_run_approval")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class IndoorRunApproval {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "challenge_workout_id", nullable = false)
  private ChallengeWorkout challengeWorkout;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "voter_user_id", nullable = false)
  private AppUser voter;

  /** null=대기, true=승인, false=거부 */
  @Column(name = "approved")
  private Boolean approved;

  @Column(name = "responded_at")
  private OffsetDateTime respondedAt;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  // ── 도메인 메서드 ──────────────────────────────────────────────

  /** 투표를 기록한다. approved=true면 승인, false면 거부. 응답 시각도 함께 기록한다. */
  public void castVote(boolean approved) {
    this.approved = approved;
    this.respondedAt = OffsetDateTime.now();
  }
}
