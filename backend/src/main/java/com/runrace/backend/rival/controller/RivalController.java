package com.runrace.backend.rival.controller;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.rival.dto.AddRivalRequest;
import com.runrace.backend.rival.dto.RivalRow;
import com.runrace.backend.rival.service.RivalService;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 라이벌 관리 — 등록(닉네임)·목록(전적 포함)·해제. */
@RestController
@RequestMapping("/api/rivals")
@RequiredArgsConstructor
public class RivalController {
  private final RivalService rivalService;

  @GetMapping
  public ResponseEntity<List<RivalRow>> list(AuthPrincipal principal) {
    return ResponseEntity.ok(rivalService.listRivals(principal.userId()));
  }

  @PostMapping
  public ResponseEntity<Void> add(AuthPrincipal principal, @RequestBody AddRivalRequest body) {
    rivalService.addRival(principal.userId(), body.nickname());
    return ResponseEntity.noContent().build();
  }

  @DeleteMapping("/{rivalUserId}")
  public ResponseEntity<Void> remove(
      AuthPrincipal principal, @PathVariable("rivalUserId") UUID rivalUserId) {
    rivalService.removeRival(principal.userId(), rivalUserId);
    return ResponseEntity.noContent().build();
  }
}
