package com.runrace.backend.crew.controller;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.crew.dto.ApplyToCrewRequest;
import com.runrace.backend.crew.dto.CreateCrewRequest;
import com.runrace.backend.crew.dto.CrewDetailResponse;
import com.runrace.backend.crew.dto.CrewDiscoveryItem;
import com.runrace.backend.crew.dto.CrewInsightsResponse;
import com.runrace.backend.crew.dto.CrewDiscoveryResponse;
import com.runrace.backend.crew.dto.CrewJoinRequestRow;
import com.runrace.backend.crew.dto.CrewRecapResponse;
import com.runrace.backend.crew.dto.CrewSearchItem;
import com.runrace.backend.crew.dto.JoinCrewRequest;
import com.runrace.backend.crew.dto.MyApplicationRow;
import com.runrace.backend.crew.dto.MyCrewResponse;
import com.runrace.backend.crew.dto.RejectJoinRequestRequest;
import com.runrace.backend.crew.dto.UpdateCrewProfileRequest;
import com.runrace.backend.crew.dto.UpdateCrewRequest;
import com.runrace.backend.crew.repository.CrewRepository;
import com.runrace.backend.crew.service.CrewService;
import com.runrace.backend.nudge.dto.NudgeRequest;
import com.runrace.backend.nudge.service.NudgeService;
import java.util.List;
import java.util.Optional;
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

/** 크루(C0) — 생성·초대 코드 가입·발견(가입신청)·주간 보드·리더 관리. */
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

  /**
   * 멤버가 많은 순서의 크루 발견 목록 — 10개씩 더보기, 지역 필터(생략/빈 값=전체). 비회원도 조회 가능.
   */
  @GetMapping("/discover")
  public ResponseEntity<CrewDiscoveryResponse> discover(
      @RequestParam(required = false) String region,
      @RequestParam(defaultValue = "0") int page) {
    int size = 10;
    List<CrewRepository.CrewDiscoveryRow> rows = crewService.discover(region, page, size);
    boolean hasMore = rows.size() > size;
    List<CrewDiscoveryItem> crews = rows.stream().limit(size)
        .map(CrewDiscoveryItem::from)
        .toList();
    return ResponseEntity.ok(new CrewDiscoveryResponse(crews, hasMore));
  }

  /** 공개 크루 상세 — 비회원도 조회 가능. 로그인 상태면 내 신청 상태(대기중/쿨다운)를 함께 내려준다. */
  @GetMapping("/{id}")
  public ResponseEntity<CrewDetailResponse> detail(
      Optional<AuthPrincipal> principal, @PathVariable("id") long id) {
    UUID viewerId = principal.map(AuthPrincipal::userId).orElse(null);
    return ResponseEntity.ok(crewService.detail(id, viewerId));
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
    crewService.create(principal.userId(), body.name(), body.region());
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
    crewService.update(principal.userId(), id, body.notice(), body.weekGoalKm());
    return ResponseEntity.noContent().build();
  }

  /** 발견 프로필(지역·이미지·소개·정기런) 수정(리더 전용). */
  @PatchMapping("/{id}/profile")
  public ResponseEntity<Void> updateProfile(
      AuthPrincipal principal, @PathVariable("id") long id, @RequestBody UpdateCrewProfileRequest body) {
    crewService.updateProfile(
        principal.userId(), id, body.region(), body.imageUrl(), body.imageUrls(), body.intro(),
        body.meetupPlace(), body.meetupDays(), body.meetupTime(), body.foundedAt());
    return ResponseEntity.noContent().build();
  }

  // ── 가입신청(승인제) ──────────────────────────────────────────

  /** 발견 목록에서 가입 신청. */
  @PostMapping("/{id}/apply")
  public ResponseEntity<Void> apply(
      AuthPrincipal principal, @PathVariable("id") long id, @RequestBody(required = false) ApplyToCrewRequest body) {
    crewService.apply(principal.userId(), id, body != null ? body.message() : null);
    return ResponseEntity.noContent().build();
  }

  /** 가입 신청 승인(리더 전용). */
  @PostMapping("/join-requests/{requestId}/approve")
  public ResponseEntity<Void> approveJoinRequest(
      AuthPrincipal principal, @PathVariable("requestId") long requestId) {
    crewService.approve(principal.userId(), requestId);
    return ResponseEntity.noContent().build();
  }

  /** 가입 신청 거절(리더 전용). 사유는 선택. */
  @PostMapping("/join-requests/{requestId}/reject")
  public ResponseEntity<Void> rejectJoinRequest(
      AuthPrincipal principal, @PathVariable("requestId") long requestId,
      @RequestBody(required = false) RejectJoinRequestRequest body) {
    crewService.reject(principal.userId(), requestId, body != null ? body.reason() : null);
    return ResponseEntity.noContent().build();
  }

  /** 가입 신청 철회(신청자 본인). */
  @PostMapping("/join-requests/{requestId}/cancel")
  public ResponseEntity<Void> cancelJoinRequest(
      AuthPrincipal principal, @PathVariable("requestId") long requestId) {
    crewService.cancelApplication(principal.userId(), requestId);
    return ResponseEntity.noContent().build();
  }

  /** 리더 인박스 — 내 크루의 대기중 가입신청 전체. */
  @GetMapping("/me/join-requests")
  public ResponseEntity<List<CrewJoinRequestRow>> myCrewJoinRequests(AuthPrincipal principal) {
    return ResponseEntity.ok(crewService.leaderInbox(principal.userId()));
  }

  /** 내 신청 현황 — 대기중인 가입신청 전체(크루 미소속 홈에서 노출). */
  @GetMapping("/my-applications")
  public ResponseEntity<List<MyApplicationRow>> myApplications(AuthPrincipal principal) {
    return ResponseEntity.ok(crewService.myApplications(principal.userId()));
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
