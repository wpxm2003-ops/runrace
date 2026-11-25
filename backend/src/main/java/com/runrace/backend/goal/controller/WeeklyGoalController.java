package com.runrace.backend.goal.controller;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.goal.dto.WeeklyGoalRequest;
import com.runrace.backend.goal.dto.WeeklyGoalResponse;
import com.runrace.backend.goal.service.WeeklyGoalService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 개인 주간 목표 — 홈 맨 위 카드의 목표·이번 주 진척·현재 연속 기록. */
@RestController
@RequestMapping("/api/weekly-goal")
@RequiredArgsConstructor
public class WeeklyGoalController {

  private final WeeklyGoalService weeklyGoalService;

  /** 목표(없으면 goal=null) + 이번 주 진척 + 현재 연속 기록 + 추천값. */
  @GetMapping
  public ResponseEntity<WeeklyGoalResponse> get(AuthPrincipal principal) {
    return ResponseEntity.ok(weeklyGoalService.status(principal.userId()));
  }

  /** 목표 저장(생성·수정 겸용). 저장 후 최신 상태를 돌려준다. */
  @PutMapping
  public ResponseEntity<WeeklyGoalResponse> update(
      AuthPrincipal principal, @RequestBody WeeklyGoalRequest body) {
    return ResponseEntity.ok(weeklyGoalService.update(principal.userId(), body));
  }
}
