package com.runrace.backend.nudge.controller;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.nudge.dto.NudgeRequest;
import com.runrace.backend.nudge.service.NudgeService;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 레이스 참가자 간 콕 찌르기 — 레이스 컨텍스트 아래 둔다. */
@RestController
@RequestMapping("/api/challenges")
@RequiredArgsConstructor
public class NudgeController {
  private final NudgeService nudgeService;

  @PostMapping("/{challengeId:[0-9]+}/nudge/{targetUserId}")
  public ResponseEntity<Void> nudge(
      AuthPrincipal principal,
      @PathVariable("challengeId") Long challengeId,
      @PathVariable("targetUserId") UUID targetUserId,
      @RequestBody(required = false) NudgeRequest body) {
    Integer variant = body != null ? body.variant() : null;
    nudgeService.nudge(principal, challengeId, targetUserId, variant);
    return ResponseEntity.noContent().build();
  }
}
