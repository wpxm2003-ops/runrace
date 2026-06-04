package com.runrace.backend.challenge;

import com.runrace.backend.user.AppUser;
import com.runrace.backend.workout.WorkoutSession;
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
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "challenge_workout")
@Getter
@Setter
@NoArgsConstructor
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
}
