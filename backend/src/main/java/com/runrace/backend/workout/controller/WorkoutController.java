package com.runrace.backend.workout.controller;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.common.IsoTime;
import com.runrace.backend.common.PathPatterns;
import com.runrace.backend.shoe.service.ShoeService;
import com.runrace.backend.workout.dto.CreateIndoorRunRequest;
import com.runrace.backend.workout.dto.CreateWorkoutRequest;
import com.runrace.backend.workout.dto.CreateWorkoutResponse;
import com.runrace.backend.workout.dto.IndoorRunVoteRequest;
import com.runrace.backend.workout.dto.PersonalBestRow;
import com.runrace.backend.workout.service.PersonalBestService;
import com.runrace.backend.workout.dto.UpdateWorkoutImageRequest;
import com.runrace.backend.workout.dto.UpdateWorkoutMemoRequest;
import com.runrace.backend.workout.dto.UpdateWorkoutShoeRequest;
import com.runrace.backend.workout.dto.WorkoutComparisonResponse;
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
import org.springframework.web.bind.annotation.PatchMapping;
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
  private static final String ID_PATH = PathPatterns.ID;

  private final WorkoutService workoutService;
  private final PersonalBestService personalBestService;
  private final ShoeService shoeService;

  @PostMapping
  public ResponseEntity<CreateWorkoutResponse> create(
      AuthPrincipal principal, @RequestBody CreateWorkoutRequest body) {
    List<WorkoutService.PathPoint> path =
        body.path().stream().map(p -> new WorkoutService.PathPoint(p.lat(), p.lng(), p.t())).toList();
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
    var pb = body.bestSegments() != null
        ? personalBestService.evaluate(principal.userId(), session.getId(), body.bestSegments()).orElse(null)
        : null;
    return ResponseEntity.ok(new CreateWorkoutResponse(session.getId(), pb));
  }

  /** 실내러닝 등록 — path 없이 거리·시간만 입력. */
  @PostMapping("/indoor")
  public ResponseEntity<CreateWorkoutResponse> createIndoor(
      AuthPrincipal principal, @RequestBody CreateIndoorRunRequest body) {
    WorkoutSession session = workoutService.createIndoor(
        principal, body.distanceM(), body.durationSec(), body.startedAt(), body.imageUrl());
    return ResponseEntity.ok(new CreateWorkoutResponse(session.getId(), null));
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

  /** 내 개인 기록(PB) 목록 — NSM 페이스 자동 입력 등. */
  @GetMapping("/personal-bests")
  public ResponseEntity<List<PersonalBestRow>> personalBests(AuthPrincipal principal) {
    return ResponseEntity.ok(personalBestService.listForUser(principal.userId()));
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

  @GetMapping("/{id:" + ID_PATH + "}/comparison")
  public ResponseEntity<WorkoutComparisonResponse> comparison(
      AuthPrincipal principal, @PathVariable("id") Long id) {
    return ResponseEntity.ok(workoutService.getComparison(principal, id));
  }

  @PatchMapping("/{id:" + ID_PATH + "}/memo")
  public ResponseEntity<Void> updateMemo(
      AuthPrincipal principal,
      @PathVariable("id") Long id,
      @RequestBody UpdateWorkoutMemoRequest body) {
    workoutService.updateMemo(principal, id, body.memo());
    return ResponseEntity.noContent().build();
  }

  /** 운동 사진 설정·교체·삭제 — imageUrl이 null/blank면 삭제. */
  @PatchMapping("/{id:" + ID_PATH + "}/image")
  public ResponseEntity<Void> updateImage(
      AuthPrincipal principal,
      @PathVariable("id") Long id,
      @RequestBody UpdateWorkoutImageRequest body) {
    workoutService.updateImage(principal, id, body.imageUrl());
    return ResponseEntity.noContent().build();
  }

  /** 러닝의 신발 귀속 변경 — shoeId가 null이면 해제. */
  @PatchMapping("/{id:" + ID_PATH + "}/shoe")
  public ResponseEntity<Void> updateShoe(
      AuthPrincipal principal,
      @PathVariable("id") Long id,
      @RequestBody UpdateWorkoutShoeRequest body) {
    shoeService.reassignWorkoutShoe(principal.userId(), id, body.shoeId());
    return ResponseEntity.noContent().build();
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
