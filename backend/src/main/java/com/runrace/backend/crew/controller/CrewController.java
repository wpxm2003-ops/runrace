package com.runrace.backend.crew.controller;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.crew.dto.CreateCrewRequest;
import com.runrace.backend.crew.dto.CrewInsightsResponse;
import com.runrace.backend.crew.dto.CrewDiscoveryResponse;
import com.runrace.backend.crew.dto.CrewRecapResponse;
import com.runrace.backend.crew.dto.CrewSearchItem;
import com.runrace.backend.crew.dto.JoinCrewRequest;
import com.runrace.backend.crew.dto.MyCrewResponse;
import com.runrace.backend.crew.dto.UpdateCrewRequest;
import com.runrace.backend.crew.repository.CrewRepository;
import com.runrace.backend.crew.service.CrewService;
import com.runrace.backend.nudge.dto.NudgeRequest;
import com.runrace.backend.nudge.service.NudgeService;
import java.util.List;
import java.util.UUID;
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

/** 크루(C0) — 생성·초대 코드 가입·주간 보드·리더 관리. */
@RestController
@RequestMapping("/api/crews")
@RequiredArgsConstructor
public class CrewController {
  private final CrewService crewService;
  private final NudgeService nudgeService;

  /** 내 크루 홈(주간 보드 포함). 미소속이면 {@code crew: null}. */
  @GetMapping("/me")
  public ResponseEntity<MyCrewResponse> myCrew(AuthPrincipal principal) {
    return ResponseEntity.ok(crewService.myCrew(principal.userId()));
  }

  /** 지난주 크루 결산 — 홈 결산 섹션 + 공유 카드용. */
  @GetMapping("/me/recap")
  public ResponseEntity<CrewRecapResponse> recap(AuthPrincipal principal) {
    return ResponseEntity.ok(crewService.recap(principal.userId()));
  }

  /** 크루 잔디 + 명예의 전당 — 크루 홈 부가 콘텐츠. */
  @GetMapping("/me/insights")
  public ResponseEntity<CrewInsightsResponse> insights(AuthPrincipal principal) {
    return ResponseEntity.ok(crewService.insights(principal.userId()));
  }

  /** 크루 검색(도전장 상대 선택) — 내 크루 제외, 멤버 많은 순 상위 30개. */
  @GetMapping("/search")
  public ResponseEntity<List<CrewSearchItem>> search(
      AuthPrincipal principal,
      @RequestParam(name = "query", required = false, defaultValue = "") String query) {
    List<CrewSearchItem> items = crewService.search(principal.userId(), query).stream()
        .map(r -> new CrewSearchItem(r.getId(), r.getName(), r.getMemberCount()))
        .toList();
    return ResponseEntity.ok(items);
  }

  /** 멤버가 많은 순서의 크루 탐색 목록 — 10개씩 더보기. */
  @GetMapping("/discover")
  public ResponseEntity<CrewDiscoveryResponse> discover(
      AuthPrincipal principal, @RequestParam(defaultValue = "0") int page) {
    int size = 10;
    List<CrewRepository.CrewSearchRow> rows = crewService.discover(page, size);
    boolean hasMore = rows.size() > size;
    List<CrewSearchItem> crews = rows.stream().limit(size)
        .map(r -> new CrewSearchItem(r.getId(), r.getName(), r.getMemberCount()))
        .toList();
    return ResponseEntity.ok(new CrewDiscoveryResponse(crews, hasMore));
  }

  /** 같은 크루 멤버에게 콕 찌르기(하루 1회). */
  @PostMapping("/nudge/{targetUserId}")
  public ResponseEntity<Void> nudge(
      AuthPrincipal principal,
      @PathVariable("targetUserId") UUID targetUserId,
      @RequestBody(required = false) NudgeRequest body) {
    nudgeService.crewNudge(principal, targetUserId, body != null ? body.variant() : null);
    return ResponseEntity.noContent().build();
  }

  @PostMapping
  public ResponseEntity<Void> create(AuthPrincipal principal, @RequestBody CreateCrewRequest body) {
    crewService.create(principal.userId(), body.name());
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/join")
  public ResponseEntity<Void> join(AuthPrincipal principal, @RequestBody JoinCrewRequest body) {
    crewService.join(principal.userId(), body.code());
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/leave")
  public ResponseEntity<Void> leave(AuthPrincipal principal) {
    crewService.leave(principal.userId());
    return ResponseEntity.noContent().build();
  }

  @PatchMapping("/{id}")
  public ResponseEntity<Void> update(
      AuthPrincipal principal, @PathVariable("id") long id, @RequestBody UpdateCrewRequest body) {
    crewService.update(principal.userId(), id, body.name(), body.notice(), body.weekGoalKm());
    return ResponseEntity.noContent().build();
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> disband(AuthPrincipal principal, @PathVariable("id") long id) {
    crewService.disband(principal.userId(), id);
    return ResponseEntity.noContent().build();
  }

  @DeleteMapping("/{id}/members/{userId}")
  public ResponseEntity<Void> kick(
      AuthPrincipal principal,
      @PathVariable("id") long id,
      @PathVariable("userId") UUID userId) {
    crewService.kick(principal.userId(), id, userId);
    return ResponseEntity.noContent().build();
  }
}
