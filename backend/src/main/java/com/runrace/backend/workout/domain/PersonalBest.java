package com.runrace.backend.workout.domain;

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

@Entity
@Table(name = "personal_best")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PersonalBest {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private UUID userId;

  @Column(nullable = false, length = 10)
  private String distanceKey;

  @Column(nullable = false)
  private int bestPaceSec;

  @Column(nullable = false)
  private int distanceM;

  @Column(nullable = false)
  private Long workoutId;

  @Column(nullable = false)
  private OffsetDateTime achievedAt;

  public static PersonalBest of(UUID userId, String distanceKey, int bestPaceSec, int distanceM, Long workoutId) {
    PersonalBest pb = new PersonalBest();
    pb.userId = userId;
    pb.distanceKey = distanceKey;
    pb.bestPaceSec = bestPaceSec;
    pb.distanceM = distanceM;
    pb.workoutId = workoutId;
    pb.achievedAt = OffsetDateTime.now();
    return pb;
  }

  public void update(int newPaceSec, int newDistanceM, Long newWorkoutId) {
    this.bestPaceSec = newPaceSec;
    this.distanceM = newDistanceM;
    this.workoutId = newWorkoutId;
    this.achievedAt = OffsetDateTime.now();
  }
}
