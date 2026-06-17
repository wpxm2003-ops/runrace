package com.runrace.backend.workout.controller;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.common.IsoTime;
import com.runrace.backend.workout.dto.CreateIndoorRunRequest;
import com.runrace.backend.workout.dto.CreateWorkoutRequest;
import com.runrace.backend.workout.dto.CreateWorkoutResponse;
import com.runrace.backend.workout.dto.IndoorRunVoteRequest;
import com.runrace.backend.workout.dto.WorkoutDetailResponse;
import com.runrace.backend.workout.dto.WorkoutListItem;
import com.runrace.backend.workout.dto.WorkoutShareResponse;
import com.runrace.backend.workout.dto.WorkoutSummaryResponse;
import com.runrace.backend.workout.domain.WorkoutSession;
import com.runrace.backend.workout.service.WorkoutService;
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
import org.springframework.web.bind.annotation.RequestParam;
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

  /** 실내러닝 등록 — path 없이 거리·시간만 입력. */
  @PostMapping("/indoor")
  public ResponseEntity<CreateWorkoutResponse> createIndoor(
      AuthPrincipal principal, @RequestBody CreateIndoorRunRequest body) {
    WorkoutSession session = workoutService.createIndoor(
        principal, body.distanceM(), body.durationSec(), body.startedAt(), body.imageUrl());
    return ResponseEntity.ok(new CreateWorkoutResponse(session.getId()));
  }

  /** 실내러닝 승인/거부 투표. */
  @PostMapping("/{id:" + ID_PATH + "}/vote")
  public ResponseEntity<Void> vote(
      AuthPrincipal principal,
      @PathVariable("id") Long id,
      @RequestBody IndoorRunVoteRequest body) {
    workoutService.voteIndoorRun(principal, id, body.approved());
    return ResponseEntity.noContent().build();
  }

  /** 전체 운동 기록 요약 (내정보). */
  @GetMapping("/summary")
  public ResponseEntity<WorkoutSummaryResponse> summary(AuthPrincipal principal) {
    return ResponseEntity.ok(workoutService.summaryForUser(principal.userId()));
  }

  /** 기록 달력용 — 연도별 운동 목록. year 없으면 전체(레거시). */
  @GetMapping
  public ResponseEntity<List<WorkoutListItem>> list(
      AuthPrincipal principal, @RequestParam(required = false) Integer year) {
    var sessions =
        year != null
            ? workoutService.listForUserInYear(principal.userId(), year)
            : workoutService.listForUser(principal.userId());
    List<WorkoutListItem> items =
        sessions.stream()
            .map(
                session ->
                    new WorkoutListItem(
                        session.getId(),
                        IsoTime.format(session.getStartedAt()),
                        IsoTime.format(session.getEndedAt()),
                        session.getDurationSec(),
                        session.getDistanceM(),
                        session.getCalories(),
                        session.getAvgPaceSecPerKm(),
                        session.getWorkoutType().name()))
            .toList();
    return ResponseEntity.ok(items);
  }

  @GetMapping("/{id:" + ID_PATH + "}")
  public ResponseEntity<WorkoutDetailResponse> detail(
      AuthPrincipal principal, @PathVariable("id") Long id) {
    WorkoutSession session = workoutService.getForUser(principal.userId(), id);
    return ResponseEntity.ok(
        WorkoutDetailResponse.from(session, workoutService.toPath(session.getPathJson())));
  }

  /** 공개 공유 페이지 — 인증 불필요. */
  @GetMapping("/{id:" + ID_PATH + "}/share")
  public ResponseEntity<WorkoutShareResponse> share(@PathVariable("id") Long id) {
    WorkoutSession session = workoutService.getForShare(id);
    return ResponseEntity.ok(
        WorkoutShareResponse.from(session, workoutService.toPath(session.getPathJson())));
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
