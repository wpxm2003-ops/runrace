package com.runrace.backend.workout;

import com.runrace.backend.auth.AuthContext;
import com.runrace.backend.auth.AuthPrincipal;
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
  public ResponseEntity<CreateWorkoutResponse> create(@RequestBody CreateWorkoutRequest body) {
    AuthPrincipal principal = AuthContext.getRequired();
    WorkoutSession session =
        workoutService.create(
            principal,
            OffsetDateTime.parse(body.startedAt()),
            OffsetDateTime.parse(body.endedAt()),
            body.durationSec(),
            body.distanceM(),
            body.calories(),
            body.avgPaceSecPerKm(),
            body.path().stream().map(p -> new WorkoutService.PathPoint(p.lat(), p.lng())).toList());
    return ResponseEntity.ok(new CreateWorkoutResponse(session.getId()));
  }

  @GetMapping(value = {"", "/list"})
  public ResponseEntity<List<WorkoutListItem>> list() {
    AuthPrincipal principal = AuthContext.getRequired();
    List<WorkoutListItem> items =
        workoutService.listForUser(principal.userId()).stream()
            .map(
                s ->
                    new WorkoutListItem(
                        s.getId(),
                        s.getStartedAt().toString(),
                        s.getEndedAt().toString(),
                        s.getDurationSec(),
                        s.getDistanceM(),
                        s.getCalories(),
                        s.getAvgPaceSecPerKm()))
            .toList();
    return ResponseEntity.ok(items);
  }

  @GetMapping("/{id:" + ID_PATH + "}")
  public ResponseEntity<WorkoutDetailResponse> detail(@PathVariable("id") Long id) {
    AuthPrincipal principal = AuthContext.getRequired();
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
  public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
    return deleteInternal(id);
  }

  @PostMapping("/{id:" + ID_PATH + "}/delete")
  public ResponseEntity<Void> deleteByPost(@PathVariable("id") Long id) {
    return deleteInternal(id);
  }

  private ResponseEntity<Void> deleteInternal(Long id) {
    AuthPrincipal principal = AuthContext.getRequired();
    workoutService.deleteForUser(principal, id);
    return ResponseEntity.noContent().build();
  }

  public record CreateWorkoutRequest(
      String startedAt,
      String endedAt,
      int durationSec,
      int distanceM,
      int calories,
      Integer avgPaceSecPerKm,
      List<PathPointDto> path) {}

  public record PathPointDto(double lat, double lng) {}

  public record CreateWorkoutResponse(Long id) {}

  public record WorkoutListItem(
      Long id,
      String startedAt,
      String endedAt,
      int durationSec,
      int distanceM,
      int calories,
      Integer avgPaceSecPerKm) {}

  public record WorkoutDetailResponse(
      Long id,
      String startedAt,
      String endedAt,
      int durationSec,
      int distanceM,
      int calories,
      Integer avgPaceSecPerKm,
      List<PathPointDto> path) {}
}
