package com.runrace.backend.workout.repository;

import com.runrace.backend.workout.domain.PersonalBest;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PersonalBestRepository extends JpaRepository<PersonalBest, Long> {
  Optional<PersonalBest> findByUserIdAndDistanceKey(UUID userId, String distanceKey);

  List<PersonalBest> findAllByUserId(UUID userId);

  /**
   * 이 운동이 근거인 개인 기록 — 운동 삭제 전 함께 지운다.
   * {@code personal_best.workout_id}는 ON DELETE 없는 FK라(V33) 남겨두면 삭제가 롤백된다.
   */
  List<PersonalBest> findAllByWorkoutId(Long workoutId);
}
