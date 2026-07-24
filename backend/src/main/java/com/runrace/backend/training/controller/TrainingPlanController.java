package com.runrace.backend.training.controller;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.training.dto.NsmSessionLogRequest;
import com.runrace.backend.training.dto.NsmWeeklyProgressResponse;
import com.runrace.backend.training.dto.TrainingPlanRequest;
import com.runrace.backend.training.dto.TrainingPlanResponse;
import com.runrace.backend.training.service.NsmSessionLogService;
import com.runrace.backend.training.service.TrainingPlanService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** NSM 훈련 플랜 — 내 활성 플랜 조회/저장. */
@RestController
@RequestMapping("/api/training-plan")
@RequiredArgsConstructor
public class TrainingPlanController {

  private final TrainingPlanService trainingPlanService;
  private final NsmSessionLogService nsmSessionLogService;

  /** 내 활성 플랜. 없으면 body=null(200). */
  @GetMapping
  public ResponseEntity<TrainingPlanResponse> get(AuthPrincipal principal) {
    return ResponseEntity.ok(
        trainingPlanService.getActive(principal.userId())
            .map(TrainingPlanResponse::from)
            .orElse(null));
  }

  /** 플랜 저장(upsert). */
  @PutMapping
  public ResponseEntity<TrainingPlanResponse> save(
      AuthPrincipal principal, @RequestBody TrainingPlanRequest body) {
    return ResponseEntity.ok(
        TrainingPlanResponse.from(trainingPlanService.save(principal.userId(), body)));
  }

  /**
   * 플랜 취소(삭제). 정적 export 환경에서 DELETE가 막히는 경우가 있어 POST를 사용한다.
   * 플랜이 없어도 204(멱등).
   */
  @PostMapping("/cancel")
  public ResponseEntity<Void> cancel(AuthPrincipal principal) {
    trainingPlanService.cancel(principal.userId());
    return ResponseEntity.noContent().build();
  }

  /**
   * sub-T 세션 수행 기록 — 런 저장 성공 직후 1회. 같은 운동 기록이면 멱등하게 무시된다.
   * 수행 시점에만 알 수 있는 사실이라 여기서 놓치면 사후 복원이 불가능하다.
   */
  @PostMapping("/sessions")
  public ResponseEntity<Void> logSession(
      AuthPrincipal principal, @RequestBody NsmSessionLogRequest body) {
    nsmSessionLogService.log(principal.userId(), body);
    return ResponseEntity.noContent().build();
  }

  /** 이번 주 sub-T 진척(완주 수 / 플랜 목표 횟수). */
  @GetMapping("/sessions/weekly")
  public ResponseEntity<NsmWeeklyProgressResponse> weeklyProgress(AuthPrincipal principal) {
    return ResponseEntity.ok(nsmSessionLogService.weeklyProgress(principal.userId()));
  }
}
