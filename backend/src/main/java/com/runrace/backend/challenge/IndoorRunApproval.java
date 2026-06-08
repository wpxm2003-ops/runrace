package com.runrace.backend.challenge;

import com.runrace.backend.user.AppUser;
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
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "indoor_run_approval")
@Getter
@Setter
@NoArgsConstructor
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
}
