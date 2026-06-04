package com.runrace.backend.workout;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.workout.dto.CreateWorkoutRequest;
import com.runrace.backend.workout.dto.CreateWorkoutResponse;
import com.runrace.backend.workout.dto.PathPointDto;
import com.runrace.backend.workout.dto.WorkoutDetailResponse;
import com.runrace.backend.workout.dto.WorkoutListItem;
import java.time.OffsetDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/workouts")
@RequiredArgsConstructor
public class WorkoutController {
  private static final String ID_PATH = "[0-9]+";

  private final WorkoutService workoutService;

  @PostMapping
  public ResponseEntity<CreateWorkoutResponse> create(
      AuthPrincipal principal, @RequestBody CreateWorkoutRequest body) {
    List<WorkoutService.PathPoint> path =
        body.path().stream().map(p -> new WorkoutService.PathPoint(p.lat(), p.lng())).toList();
    WorkoutSession session =
        workoutService.create(
            principal,
            OffsetDateTime.parse(body.startedAt()),
            OffsetDateTime.parse(body.endedAt()),
            body.durationSec(),
            body.distanceM(),
            body.calories(),
            body.avgPaceSecPerKm(),
            path);
    return ResponseEntity.ok(new CreateWorkoutResponse(session.getId()));
  }

  @GetMapping(value = {"", "/list"})
  public ResponseEntity<List<WorkoutListItem>> list(AuthPrincipal principal) {
    List<WorkoutListItem> items =
        workoutService.listForUser(principal.userId()).stream()
            .map(
                session ->
                    new WorkoutListItem(
                        session.getId(),
                        session.getStartedAt().toString(),
                        session.getEndedAt().toString(),
                        session.getDurationSec(),
                        session.getDistanceM(),
                        session.getCalories(),
                        session.getAvgPaceSecPerKm()))
            .toList();
    return ResponseEntity.ok(items);
  }

  @GetMapping("/{id:" + ID_PATH + "}")
  public ResponseEntity<WorkoutDetailResponse> detail(
      AuthPrincipal principal, @PathVariable("id") Long id) {
    WorkoutSession session = workoutService.getForUser(principal.userId(), id);
    List<PathPointDto> path =
        workoutService.parsePath(session.getPathJson()).stream()
            .map(p -> new PathPointDto(p.lat(), p.lng()))
            .toList();
    return ResponseEntity.ok(
        new WorkoutDetailResponse(
            session.getId(),
            session.getStartedAt().toString(),
            session.getEndedAt().toString(),
            session.getDurationSec(),
            session.getDistanceM(),
            session.getCalories(),
            session.getAvgPaceSecPerKm(),
            path));
  }

  @DeleteMapping("/{id:" + ID_PATH + "}")
  public ResponseEntity<Void> delete(AuthPrincipal principal, @PathVariable("id") Long id) {
    workoutService.deleteForUser(principal, id);
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/{id:" + ID_PATH + "}/delete")
  public ResponseEntity<Void> deleteByPost(AuthPrincipal principal, @PathVariable("id") Long id) {
    workoutService.deleteForUser(principal, id);
    return ResponseEntity.noContent().build();
  }
}
