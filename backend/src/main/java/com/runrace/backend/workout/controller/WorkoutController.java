package com.runrace.backend.workout.controller;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.common.IsoTime;
import com.runrace.backend.common.PathPatterns;
import com.runrace.backend.shoe.service.ShoeService;
import com.runrace.backend.workout.dto.CreateIndoorRunRequest;
import com.runrace.backend.workout.dto.CreateWorkoutRequest;
import com.runrace.backend.workout.dto.CreateWorkoutResponse;
import com.runrace.backend.workout.dto.IndoorRunVoteRequest;
import com.runrace.backend.workout.dto.Achievement;
import com.runrace.backend.workout.dto.PersonalBestResult;
import com.runrace.backend.workout.dto.PersonalBestRow;
import com.runrace.backend.workout.service.AchievementService;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
  private static final Logger log = LoggerFactory.getLogger(WorkoutController.class);
  private static final String ID_PATH = PathPatterns.ID;

  private final WorkoutService workoutService;
  private final PersonalBestService personalBestService;
  private final AchievementService achievementService;
  private final ShoeService shoeService;

  @PostMapping
  public ResponseEntity<CreateWorkoutResponse> create(
      AuthPrincipal principal, @RequestBody CreateWorkoutRequest body) {
    List<WorkoutService.PathPoint> path =
        body.path().stream().map(p -> new WorkoutService.PathPoint(p.lat(), p.lng(), p.t(), p.ele())).toList();
    WorkoutSession session =
        workoutService.create(
            principal,
            OffsetDateTime.parse(body.startedAt()),
            OffsetDateTime.parse(body.endedAt()),
            body.durationSec(),
            body.distanceM(),
            body.calories(),
            body.avgPaceSecPerKm(),
            path,
            body.ghostWorkoutId(),
            body.ghostResult(),
            body.clientWorkoutId());
    // 여기부터는 축하(PB·성과) 계산 — 운동 저장 트랜잭션은 이미 커밋됐다.
    // 이 단계에서 예외로 500을 내면 프론트 withRetry가 저장 자체를 다시 POST해 중복 기록이 생기므로,
    // 실패해도 삼켜 기록하고 저장 성공 응답을 내려보낸다.
    PersonalBestResult pb = null;
    try {
      pb = body.bestSegments() != null
          ? personalBestService.evaluate(principal.userId(), session.getId(), body.bestSegments()).orElse(null)
          : null;
    } catch (RuntimeException e) {
      log.error("PB 판정 실패 — 운동 저장은 완료됨 (workoutId={})", session.getId(), e);
    }
    List<Achievement> achievements = List.of();
    try {
      achievements = achievementService.evaluate(principal.userId(), session);
    } catch (RuntimeException e) {
      log.error("오늘의 성과 판정 실패 — 운동 저장은 완료됨 (workoutId={})", session.getId(), e);
    }
    return ResponseEntity.ok(new CreateWorkoutResponse(session.getId(), pb, achievements));
  }

  /** 실내러닝 등록 — path 없이 거리·시간만 입력. */
  @PostMapping("/indoor")
  public ResponseEntity<CreateWorkoutResponse> createIndoor(
      AuthPrincipal principal, @RequestBody CreateIndoorRunRequest body) {
    WorkoutSession session = workoutService.createIndoor(
        principal,
        body.distanceM(),
        body.durationSec(),
        body.startedAt(),
        body.imageUrl(),
        body.clientWorkoutId());
    // 실내런도 전체 누적 성과에는 포함한다. AchievementService가 소급 기록에 대해
    // 오늘/이번 주/이번 달처럼 현재 기간에 종속된 성과만 제외한다.
    List<Achievement> achievements = List.of();
    try {
      achievements = achievementService.evaluate(principal.userId(), session);
    } catch (RuntimeException e) {
      log.error("Indoor achievement evaluation failed; workout is already saved (workoutId={})",
          session.getId(), e);
    }
    return ResponseEntity.ok(new CreateWorkoutResponse(session.getId(), null, achievements));
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

  /** 기록 달력용 — 연도별 운동 목록. */
  @GetMapping
  public ResponseEntity<List<WorkoutListItem>> list(
      AuthPrincipal principal, @RequestParam Integer year) {
    var sessions = workoutService.listForUserInYear(principal.userId(), year);
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
