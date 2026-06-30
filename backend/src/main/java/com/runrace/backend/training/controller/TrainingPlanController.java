package com.runrace.backend.training.controller;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.training.dto.TrainingPlanRequest;
import com.runrace.backend.training.dto.TrainingPlanResponse;
import com.runrace.backend.training.service.TrainingPlanService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
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
}
