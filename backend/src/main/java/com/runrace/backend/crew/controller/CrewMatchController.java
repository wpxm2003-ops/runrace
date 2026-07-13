package com.runrace.backend.crew.controller;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.crew.dto.AcceptCrewMatchRequest;
import com.runrace.backend.crew.dto.CreateCrewMatchRequest;
import com.runrace.backend.crew.dto.CrewMatchDetailResponse;
import com.runrace.backend.crew.dto.MyCrewMatchesResponse;
import com.runrace.backend.crew.service.CrewMatchService;
import java.time.OffsetDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 크루 대항전(C1) — 도전장 발송·수락·거절·취소 + 크루 홈 섹션·상세 조회. */
@RestController
@RequestMapping("/api/crew-matches")
@RequiredArgsConstructor
public class CrewMatchController {
  private final CrewMatchService crewMatchService;

  /** 도전장 발송(리더 전용). */
  @PostMapping
  public ResponseEntity<Void> create(
      AuthPrincipal principal, @RequestBody CreateCrewMatchRequest body) {
    crewMatchService.create(
        principal.userId(),
        body.opponentCrewName(),
        body.rosterSize(),
        OffsetDateTime.parse(body.startAt()),
        OffsetDateTime.parse(body.endAt()),
        body.rosterUserIds());
    return ResponseEntity.noContent().build();
  }

  /** 크루 홈 대항전 섹션 — 전적 + 진행중 + 받은/보낸 도전장 + 최근 결과. */
  @GetMapping("/me")
  public ResponseEntity<MyCrewMatchesResponse> myMatches(AuthPrincipal principal) {
    return ResponseEntity.ok(crewMatchService.myMatches(principal.userId()));
  }

  /** 대항전 상세(참가 크루 멤버만). */
  @GetMapping("/{id}")
  public ResponseEntity<CrewMatchDetailResponse> detail(
      AuthPrincipal principal, @PathVariable("id") long id) {
    return ResponseEntity.ok(crewMatchService.detail(principal.userId(), id));
  }

  /** 도전장 수락(상대 크루 리더 전용) — 로스터 지명 포함. */
  @PostMapping("/{id}/accept")
  public ResponseEntity<Void> accept(
      AuthPrincipal principal, @PathVariable("id") long id,
      @RequestBody AcceptCrewMatchRequest body) {
    crewMatchService.accept(principal.userId(), id, body.rosterUserIds());
    return ResponseEntity.noContent().build();
  }

  /** 도전장 거절(상대 크루 리더 전용). */
  @PostMapping("/{id}/decline")
  public ResponseEntity<Void> decline(AuthPrincipal principal, @PathVariable("id") long id) {
    crewMatchService.decline(principal.userId(), id);
    return ResponseEntity.noContent().build();
  }

  /** 도전장 취소(도전 크루 리더 전용, 수락 전만). */
  @DeleteMapping("/{id}")
  public ResponseEntity<Void> cancel(AuthPrincipal principal, @PathVariable("id") long id) {
    crewMatchService.cancel(principal.userId(), id);
    return ResponseEntity.noContent().build();
  }
}
