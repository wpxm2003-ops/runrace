package com.runrace.backend.challenge.controller;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.domain.ChallengeMember;
import com.runrace.backend.challenge.domain.ChallengePhase;
import com.runrace.backend.challenge.service.ChallengeService;
import com.runrace.backend.common.PageParams;
import com.runrace.backend.challenge.service.IndoorApprovalService;
import com.runrace.backend.challenge.service.RaceFinalizationService;
import com.runrace.backend.common.IsoTime;
import com.runrace.backend.common.PathPatterns;
import com.runrace.backend.challenge.dto.ActiveCountResponse;
import com.runrace.backend.challenge.dto.ChallengeDetailResponse;
import com.runrace.backend.challenge.dto.ChallengeListItem;
import com.runrace.backend.challenge.dto.ChallengeListPage;
import com.runrace.backend.challenge.dto.CreateChallengeRequest;
import com.runrace.backend.challenge.dto.CreateChallengeResponse;
import com.runrace.backend.challenge.dto.LiveProgressRequest;
import com.runrace.backend.challenge.dto.LiveProgressResponse;
import com.runrace.backend.challenge.dto.LiveSignalRequest;
import com.runrace.backend.challenge.dto.MemberRow;
import com.runrace.backend.challenge.dto.PendingApprovalResponse;
import com.runrace.backend.challenge.dto.RejectedApprovalResponse;
import com.runrace.backend.challenge.dto.UpdateChallengeRequest;
import com.runrace.backend.challenge.dto.ChallengeWorkoutListItem;
import com.runrace.backend.challenge.dto.HeadToHeadRow;
import com.runrace.backend.challenge.service.ChallengeLiveProgressService;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.Map;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Slice;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/challenges")
@RequiredArgsConstructor
public class ChallengeController {
  private static final String ID_PATH = PathPatterns.ID;

  private final ChallengeService challengeService;
  private final IndoorApprovalService indoorApprovalService;
  private final ChallengeLiveProgressService challengeLiveProgressService;

  @GetMapping("/active-count")
  public ResponseEntity<ActiveCountResponse> activeCount(AuthPrincipal principal) {
    long count = challengeService.countActiveRoomsForCreator(principal);
    return ResponseEntity.ok(
        new ActiveCountResponse(count, ChallengeService.MAX_ACTIVE_ROOMS_PER_CREATOR));
  }

  @PostMapping
  public ResponseEntity<CreateChallengeResponse> create(
      AuthPrincipal principal, @RequestBody CreateChallengeRequest body) {
    Challenge challenge =
        challengeService.createRoom(
            principal,
            body.title(),
            body.goalKm(),
            body.maxMembers(),
            OffsetDateTime.parse(body.startAt()),
            OffsetDateTime.parse(body.endAt()),
            body.langCd(),
            body.stake(),
            Boolean.TRUE.equals(body.crewOnly()));
    return ResponseEntity.ok(new CreateChallengeResponse(challenge.getId()));
  }

  /** 내 크루 내부 레이스 — 홈 미리보기(size 소량)와 전체보기(탭·무한스크롤) 공용. */
  @GetMapping("/crew/page")
  public ResponseEntity<ChallengeListPage> listCrewRacesPage(
      AuthPrincipal principal,
      @RequestParam(name = "phase", defaultValue = "active") String phase,
      @RequestParam(name = "page", defaultValue = "0") int page,
      @RequestParam(name = "size", defaultValue = "20") int size) {
    PageParams.Clamped clamped = PageParams.clamp(page, size);
    Slice<Challenge> slice = challengeService.listCrewRacesPage(
        principal.userId(), phase, clamped.page(), clamped.size());
    return ResponseEntity.ok(toListPage(slice, Optional.of(principal.userId()),
        ids -> challengeService.memberChallengeIds(principal.userId(), ids)));
  }

  @PutMapping("/{id:" + ID_PATH + "}")
  public ResponseEntity<CreateChallengeResponse> update(
      AuthPrincipal principal, @PathVariable("id") Long id, @RequestBody UpdateChallengeRequest body) {
    Challenge challenge =
        challengeService.updateRoom(
            principal,
            id,
            body.title(),
            body.goalKm(),
            body.maxMembers(),
            OffsetDateTime.parse(body.startAt()),
            OffsetDateTime.parse(body.endAt()),
            body.stake());
    return ResponseEntity.ok(new CreateChallengeResponse(challenge.getId()));
  }

  @DeleteMapping("/{id:" + ID_PATH + "}")
  public ResponseEntity<Void> delete(AuthPrincipal principal, @PathVariable("id") Long id) {
    challengeService.deleteRoom(principal, id);
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/{id:" + ID_PATH + "}/join")
  public ResponseEntity<Void> join(AuthPrincipal principal, @PathVariable("id") Long id) {
    challengeService.joinRoom(principal, id);
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/{id:" + ID_PATH + "}/leave")
  public ResponseEntity<Void> leave(AuthPrincipal principal, @PathVariable("id") Long id) {
    challengeService.leaveRoom(principal, id);
    return ResponseEntity.noContent().build();
  }

  /**
   * 러닝 도중(정지·저장 전) 잠정 진행률 핑. 표시 전용 — 완주·우승자·경품 판정에는 관여하지
   * 않는다. 클라이언트는 60~180초 간격(기본 90초)으로 호출한다.
   */
  @PostMapping("/live-progress")
  public ResponseEntity<LiveProgressResponse> liveProgress(
      AuthPrincipal principal, @RequestBody LiveProgressRequest body) {
    return ResponseEntity.ok(
        challengeLiveProgressService.submit(
            principal.userId(), body.distanceM(), body.elapsedSec(), body.sentAt()));
  }

  /**
   * 라이브 진행률 일시정지 — 뛰는 걸 멈춘 동안 거리는 유지하되 "러닝 중" 표시에서만 뺀다.
   * 운동 일시정지·종료 모두 이 경로를 쓴다.
   *
   * <p>종료에도 삭제가 아니라 이걸 쓰는 이유: 종료 시점엔 아직 확정 저장(POST /api/workouts)이
   * 끝나지 않았다. 먼저 지우면 total_km이 오르기 전까지 진행바가 이번 런 이전 값으로 뒷걸음질
   * 친다 — 저장이 실패해 보류되면 그 상태가 오래 간다. 저장이 성공하면 확정 경로가 리셋하고,
   * 실패하면 신선도 윈도(15분)가 정리한다.
   */
  @PostMapping("/live-progress/pause")
  public ResponseEntity<Void> pauseLiveProgress(
      AuthPrincipal principal, @RequestBody LiveSignalRequest body) {
    challengeLiveProgressService.pause(principal.userId(), body.sentAt());
    return ResponseEntity.noContent().build();
  }

  /**
   * 라이브 진행률 즉시 삭제 — 이번 런을 저장하지 않기로 확정된 순간에만 쓴다(1m 미만 저장 취소,
   * 경로 없음). 일시정지로 남겨 두면 저장되지도 않을 거리가 15분간 남았다가 뒤늦게 떨어진다.
   *
   * <p>DELETE가 아니라 POST인 이유: 순서 토큰을 본문으로 받아야 하는데, 중간 프록시가 DELETE의
   * 본문을 떨구면 토큰이 0으로 도착해 요청이 통째로 거부된다.
   */
  @PostMapping("/live-progress/discard")
  public ResponseEntity<Void> discardLiveProgress(
      AuthPrincipal principal, @RequestBody LiveSignalRequest body) {
    challengeLiveProgressService.discard(principal.userId(), body.sentAt());
    return ResponseEntity.noContent().build();
  }

  @GetMapping
  public ResponseEntity<ChallengeListPage> list(
      Optional<AuthPrincipal> principal,
      @RequestParam(name = "lang", required = false) String lang,
      @RequestParam(name = "phase", required = false, defaultValue = "all") String phase,
      @RequestParam(name = "page", required = false, defaultValue = "0") int page,
      @RequestParam(name = "size", required = false, defaultValue = "20") int size) {
    PageParams.Clamped clamped = PageParams.clamp(page, size);
    Optional<UUID> userId = principal.map(AuthPrincipal::userId);
    Slice<Challenge> slice = challengeService.listPublicPage(lang, phase, clamped.page(), clamped.size());
    return ResponseEntity.ok(toListPage(slice, userId,
        ids -> userId.map(uid -> challengeService.memberChallengeIds(uid, ids)).orElse(Set.of())));
  }

  @GetMapping("/mine")
  public ResponseEntity<ChallengeListPage> listMine(
      AuthPrincipal principal,
      @RequestParam(name = "phase", required = false, defaultValue = "all") String phase,
      @RequestParam(name = "page", required = false, defaultValue = "0") int page,
      @RequestParam(name = "size", required = false, defaultValue = "20") int size) {
    PageParams.Clamped clamped = PageParams.clamp(page, size);
    UUID userId = principal.userId();
    Slice<Challenge> slice = challengeService.listMinePage(userId, phase, clamped.page(), clamped.size());
    return ResponseEntity.ok(toListPage(slice, Optional.of(userId),
        ids -> Set.copyOf(ids))); // 내 레이스는 전부 참여 중
  }

  /**
   * 목록 페이지 조립의 단일 출처 — 배치 조회(N+1 방지) 3종 + DTO 매핑.
   * 세 목록 엔드포인트가 memberIds 도출 방식만 다르게 주입한다.
   */
  private ChallengeListPage toListPage(
      Slice<Challenge> slice,
      Optional<UUID> viewerId,
      Function<List<Long>, Set<Long>> memberIdsResolver) {
    OffsetDateTime now = OffsetDateTime.now();
    List<Challenge> challenges = slice.getContent();
    List<Long> ids = challenges.stream().map(Challenge::getId).toList();
    Map<Long, Long> memberCounts = challengeService.batchMemberCounts(ids);
    Set<Long> memberIds = memberIdsResolver.apply(ids);
    Set<Long> prizeIds = challengeService.prizeChallengeIds(ids);
    List<ChallengeListItem> items = challenges.stream()
        .map(c -> toListItem(c, now, viewerId, memberCounts, memberIds, prizeIds))
        .toList();
    return new ChallengeListPage(items, slice.hasNext());
  }

  @GetMapping("/{id:" + ID_PATH + "}")
  public ResponseEntity<ChallengeDetailResponse> detail(
      Optional<AuthPrincipal> principal, @PathVariable("id") Long id) {
    ChallengeService.ChallengeDetailView detail =
        challengeService.getDetail(principal.map(AuthPrincipal::userId), id);
    return ResponseEntity.ok(toDetailResponse(detail, principal.isPresent()));
  }

  /** 현재 사용자 기준, 이 레이스의 라이벌 참여자와의 누적 전적(끝난 레이스 전부 합산). */
  @GetMapping("/{id:" + ID_PATH + "}/head-to-head")
  public ResponseEntity<List<HeadToHeadRow>> headToHead(
      AuthPrincipal principal, @PathVariable("id") Long id) {
    return ResponseEntity.ok(challengeService.headToHead(principal.userId(), id));
  }

  /** 레이스 반영 운동 목록 — 전체 공개(인증 불필요). */
  @GetMapping("/{id:" + ID_PATH + "}/workouts")
  public ResponseEntity<List<ChallengeWorkoutListItem>> listWorkouts(@PathVariable("id") Long id) {
    return ResponseEntity.ok(challengeService.listWorkouts(id));
  }

  /** 레이스 승인 대기 중인 실내러닝 목록. */
  @GetMapping("/{id:" + ID_PATH + "}/pending-approvals")
  public ResponseEntity<List<PendingApprovalResponse>> pendingApprovals(
      AuthPrincipal principal, @PathVariable("id") Long id) {
    return ResponseEntity.ok(indoorApprovalService.getPendingApprovals(id, principal.userId()));
  }

  /** 레이스 거부된 실내러닝 목록. */
  @GetMapping("/{id:" + ID_PATH + "}/rejected-approvals")
  public ResponseEntity<List<RejectedApprovalResponse>> rejectedApprovals(
      AuthPrincipal principal, @PathVariable("id") Long id) {
    return ResponseEntity.ok(indoorApprovalService.getRejectedApprovals(id, principal.userId()));
  }

  private ChallengeListItem toListItem(
      Challenge challenge,
      OffsetDateTime now,
      Optional<UUID> currentUserId,
      Map<Long, Long> memberCounts,
      Set<Long> memberIds,
      Set<Long> prizeIds) {
    ChallengePhase phase = ChallengePhase.of(challenge, now);
    boolean isOwner = currentUserId.map(challenge::isOwner).orElse(false);
    int memberCount = memberCounts.getOrDefault(challenge.getId(), 0L).intValue();
    return new ChallengeListItem(
        challenge.getId(),
        challenge.getTitle(),
        challenge.getGoalKm(),
        phase.name(),
        IsoTime.format(challenge.getStartAt()),
        IsoTime.formatOrNull(challenge.getEndAt()),
        memberCount,
        IsoTime.format(challenge.getCreatedAt()),
        isOwner,
        memberIds.contains(challenge.getId()),
        prizeIds.contains(challenge.getId()),
        challenge.getStake() != null && !challenge.getStake().isBlank(),
        challenge.getCrewId() != null);
  }

  private ChallengeDetailResponse toDetailResponse(
      ChallengeService.ChallengeDetailView detail, boolean authenticated) {
    Challenge challenge = detail.challenge();
    BigDecimal goal = challenge.getGoalKm();
    OffsetDateTime now = OffsetDateTime.now();

    // 판정 근거는 ChallengeDetailView.mayFoldLive 참조(프라이버시 경계라 그쪽에서 테스트한다).
    boolean foldLive = detail.mayFoldLive(authenticated);

    List<MemberRow> rows =
        detail.members().stream()
            .sorted(memberDisplayOrder(detail.hasStarted(), foldLive, now))
            .map(member -> toMemberRow(member, challenge, goal, detail.rivalUserIds(),
                foldLive && member.sharesLive(challenge.getCrewId() != null), now))
            .toList();

    // 익명 집계치라도 로스터가 작으면 지목이 된다(1인 레이스면 그 사람이 지금 밖에서 뛰는 중이라는
    // 사실이 그대로 드러난다). 상세는 비로그인도 조회할 수 있으므로 라이브를 볼 자격과 같은
    // 조건으로 묶는다. 본인은 세지 않는다 — 혼자 뛰면서 자기 레이스를 열면 "1명이 레이스 중"이
    // 자기 자신을 가리켜 다른 사람이 있는 것처럼 읽힌다.
    UUID viewerId = detail.currentUserId();
    boolean crewRace = challenge.getCrewId() != null;
    int liveRunnerCount = foldLive
        ? (int) detail.members().stream()
            .filter(m -> !m.getUser().getId().equals(viewerId))
            .filter(m -> m.sharesLive(crewRace))
            .filter(m -> m.isLiveRunning(now))
            .count()
        : 0;

    boolean showManage = detail.isOwner() && !detail.hasStarted();
    boolean canJoin =
        !detail.isMember()
            && !detail.hasStarted()
            && !detail.hasEnded()
            && detail.memberCount() < challenge.getMaxMembers()
            && detail.crewInsider();
    boolean canLeave =
        detail.isMember()
            && !detail.isOwner()
            && !detail.hasStarted()
            && !detail.hasEnded();
    return new ChallengeDetailResponse(
        challenge.getId(),
        challenge.getTitle(),
        challenge.getGoalKm(),
        challenge.getMaxMembers(),
        IsoTime.format(challenge.getStartAt()),
        IsoTime.formatOrNull(challenge.getEndAt()),
        challenge.getStake(),
        detail.crewName(),
        challenge.getCreator().getId(),
        detail.currentUserId(),
        detail.isMember(),
        detail.isOwner(),
        detail.hasStarted(),
        detail.hasEnded(),
        showManage,
        canJoin,
        canLeave,
        detail.memberCount(),
        liveRunnerCount,
        rows);
  }

  /**
   * 시작 전: 참여 순(먼저 참여한 사람이 위). 시작 후: 레이스 결과 순(완주 우선 → 완주 시각 →
   * 누적 km). {@code foldLive}면 라이브 반영분을 접은 값으로 정렬해 표시값과 순서를 일치시킨다.
   */
  private static Comparator<ChallengeMember> memberDisplayOrder(
      boolean hasStarted, boolean foldLive, OffsetDateTime now) {
    if (!hasStarted) {
      return Comparator.comparing(ChallengeMember::getJoinedAt);
    }
    return foldLive
        ? RaceFinalizationService.displayOrder(now)
        : RaceFinalizationService.RACE_RESULT_ORDER;
  }

  /**
   * {@code foldLive}가 false면(비인증 조회·종료된 레이스·그 멤버가 공유를 껐거나 탈퇴) 라이브
   * folding 없이 raw total_km만 내려주고 liveActive도 항상 false로 고정한다.
   *
   * <p>공유 설정을 여기서 다시 보는 이유: 쓰기 시점에만 막으면 설정을 끄기 직전에 발신된 핑이
   * 뒤늦게 값을 되살릴 수 있다. 설정은 사건이 아니라 상태이므로 읽을 때 확인해야 순서와
   * 무관하게 즉시 반영된다.
   */
  private MemberRow toMemberRow(
      ChallengeMember member, Challenge challenge, BigDecimal goal, java.util.Set<UUID> rivalUserIds,
      boolean foldLive, OffsetDateTime now) {
    UUID memberUserId = member.getUser().getId();
    // 뱃지는 "지금 달리는 중"만 — 거리는 유지하되 쉬는 동안에는 표시하지 않는다.
    boolean liveActive = foldLive && member.isLiveRunning(now);
    BigDecimal effectiveKm = foldLive ? member.effectiveTotalKm(now) : member.getTotalKm();
    return new MemberRow(
        memberUserId,
        member.getUser().getNickname(),
        effectiveKm,
        goal.subtract(effectiveKm).max(BigDecimal.ZERO),
        challengeService.progressPercent(effectiveKm, challenge),
        member.getFinishedAt() != null,
        IsoTime.formatOrNull(member.getFinishedAt()),
        member.getFinalRank(),
        rivalUserIds.contains(memberUserId),
        liveActive);
  }
}
