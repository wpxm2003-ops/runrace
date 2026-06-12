package com.runrace.backend.challenge;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.common.IsoTime;
import com.runrace.backend.challenge.dto.ActiveCountResponse;
import com.runrace.backend.challenge.dto.ChallengeDetailResponse;
import com.runrace.backend.challenge.dto.ChallengeListItem;
import com.runrace.backend.challenge.dto.ChallengeListPage;
import com.runrace.backend.challenge.dto.CreateChallengeRequest;
import com.runrace.backend.challenge.dto.CreateChallengeResponse;
import com.runrace.backend.challenge.dto.MemberRow;
import com.runrace.backend.challenge.dto.PendingApprovalResponse;
import com.runrace.backend.challenge.dto.RejectedApprovalResponse;
import com.runrace.backend.challenge.dto.UpdateChallengeRequest;
import com.runrace.backend.challenge.dto.ChallengeWorkoutListItem;
import com.runrace.backend.challenge.dto.HeadToHeadRow;
import com.runrace.backend.challenge.dto.WinnerRow;
import com.runrace.backend.workout.WorkoutService;
import com.runrace.backend.workout.WorkoutSession;
import com.runrace.backend.workout.dto.WorkoutDetailResponse;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.Map;
import java.util.List;
import java.util.Optional;
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
  private static final String ID_PATH = "[0-9]+";

  private final ChallengeService challengeService;
  private final IndoorApprovalService indoorApprovalService;
  private final WorkoutService workoutService;

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
            body.langCd());
    return ResponseEntity.ok(new CreateChallengeResponse(challenge.getId()));
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
            OffsetDateTime.parse(body.endAt()));
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

  @GetMapping
  public ResponseEntity<ChallengeListPage> list(
      Optional<AuthPrincipal> principal,
      @RequestParam(name = "lang", required = false) String lang,
      @RequestParam(name = "phase", required = false, defaultValue = "all") String phase,
      @RequestParam(name = "page", required = false, defaultValue = "0") int page,
      @RequestParam(name = "size", required = false, defaultValue = "20") int size) {
    Optional<UUID> userId = principal.map(AuthPrincipal::userId);
    OffsetDateTime now = OffsetDateTime.now();
    Slice<Challenge> slice = challengeService.listPublicPage(lang, phase, page, size);
    List<Challenge> challenges = slice.getContent();
    List<Long> ids = challenges.stream().map(Challenge::getId).toList();

    Map<Long, Long> memberCounts = challengeService.batchMemberCounts(ids);
    Set<Long> memberIds = userId
        .map(uid -> challengeService.memberChallengeIds(uid, ids))
        .orElse(Set.of());

    List<ChallengeListItem> items = challenges.stream()
        .map(challenge -> toListItem(challenge, now, userId, memberCounts, memberIds))
        .toList();
    return ResponseEntity.ok(new ChallengeListPage(items, slice.hasNext()));
  }

  @GetMapping("/mine")
  public ResponseEntity<ChallengeListPage> listMine(
      AuthPrincipal principal,
      @RequestParam(name = "phase", required = false, defaultValue = "all") String phase,
      @RequestParam(name = "page", required = false, defaultValue = "0") int page,
      @RequestParam(name = "size", required = false, defaultValue = "20") int size) {
    OffsetDateTime now = OffsetDateTime.now();
    UUID userId = principal.userId();
    Slice<Challenge> slice = challengeService.listMinePage(userId, phase, page, size);
    List<Challenge> challenges = slice.getContent();
    List<Long> ids = challenges.stream().map(Challenge::getId).toList();
    Map<Long, Long> memberCounts = challengeService.batchMemberCounts(ids);
    Set<Long> memberIds = Set.copyOf(ids); // 내 레이스는 전부 참여 중
    List<ChallengeListItem> items = challenges.stream()
        .map(challenge -> toListItem(challenge, now, Optional.of(userId), memberCounts, memberIds))
        .toList();
    return ResponseEntity.ok(new ChallengeListPage(items, slice.hasNext()));
  }

  @GetMapping("/{id:" + ID_PATH + "}")
  public ResponseEntity<ChallengeDetailResponse> detail(
      Optional<AuthPrincipal> principal, @PathVariable("id") Long id) {
    ChallengeService.ChallengeDetailView detail =
        challengeService.getDetail(principal.map(AuthPrincipal::userId), id);
    return ResponseEntity.ok(toDetailResponse(detail));
  }

  /** 현재 사용자 기준, 이 레이스의 라이벌 참여자와의 누적 전적(끝난 레이스 전부 합산). */
  @GetMapping("/{id:" + ID_PATH + "}/head-to-head")
  public ResponseEntity<List<HeadToHeadRow>> headToHead(
      AuthPrincipal principal, @PathVariable("id") Long id) {
    return ResponseEntity.ok(challengeService.headToHead(principal.userId(), id));
  }

  /** 레이스 참여자만 조회 가능한 반영 운동 목록 */
  @GetMapping("/{id:" + ID_PATH + "}/workouts")
  public ResponseEntity<List<ChallengeWorkoutListItem>> listWorkouts(
      AuthPrincipal principal, @PathVariable("id") Long id) {
    return ResponseEntity.ok(challengeService.listWorkoutsForMembers(principal, id));
  }

  @GetMapping("/{id:" + ID_PATH + "}/workouts/{workoutId:" + ID_PATH + "}")
  public ResponseEntity<WorkoutDetailResponse> workoutDetail(
      AuthPrincipal principal,
      @PathVariable("id") Long id,
      @PathVariable("workoutId") Long workoutId) {
    WorkoutSession session = challengeService.getLinkedWorkoutForMember(principal, id, workoutId);
    return ResponseEntity.ok(
        WorkoutDetailResponse.from(session, workoutService.toPath(session.getPathJson())));
  }

  /** 레이스 승인 대기 중인 실내러닝 목록. */
  @GetMapping("/{id:[0-9]+}/pending-approvals")
  public ResponseEntity<List<PendingApprovalResponse>> pendingApprovals(
      AuthPrincipal principal, @PathVariable("id") Long id) {
    return ResponseEntity.ok(indoorApprovalService.getPendingApprovals(id, principal.userId()));
  }

  /** 레이스 거부된 실내러닝 목록. */
  @GetMapping("/{id:[0-9]+}/rejected-approvals")
  public ResponseEntity<List<RejectedApprovalResponse>> rejectedApprovals(
      AuthPrincipal principal, @PathVariable("id") Long id) {
    return ResponseEntity.ok(indoorApprovalService.getRejectedApprovals(id));
  }

  private ChallengeListItem toListItem(
      Challenge challenge,
      OffsetDateTime now,
      Optional<UUID> currentUserId,
      Map<Long, Long> memberCounts,
      Set<Long> memberIds) {
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
        memberIds.contains(challenge.getId()));
  }

  private ChallengeDetailResponse toDetailResponse(ChallengeService.ChallengeDetailView detail) {
    Challenge challenge = detail.challenge();
    BigDecimal goal = ChallengeService.goalKmAsDecimal(challenge);

    List<MemberRow> rows =
        detail.members().stream()
            .sorted(memberDisplayOrder(detail.hasStarted()))
            .map(member -> toMemberRow(member, challenge, goal, detail.rivalUserIds()))
            .toList();

    WinnerRow winner =
        detail.winner() == null
            ? null
            : new WinnerRow(detail.winner().getId(), detail.winner().getNickname());

    boolean showManage = detail.isOwner() && !detail.hasStarted();
    boolean canJoin =
        !detail.isMember()
            && !detail.hasStarted()
            && !detail.hasEnded()
            && detail.memberCount() < challenge.getMaxMembers();
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
        winner,
        rows);
  }

  /** 시작 전: 참여 순(먼저 참여한 사람이 위). 시작 후: 완주 우선 → 완주 시각 → 미완주는 누적 km. */
  private static Comparator<ChallengeMember> memberDisplayOrder(boolean hasStarted) {
    if (!hasStarted) {
      return Comparator.comparing(ChallengeMember::getJoinedAt);
    }
    return (m1, m2) -> {
      boolean f1 = m1.getFinishedAt() != null;
      boolean f2 = m2.getFinishedAt() != null;
      if (f1 && f2) {
        return m1.getFinishedAt().compareTo(m2.getFinishedAt());
      } else if (f1) {
        return -1;
      } else if (f2) {
        return 1;
      } else {
        return m2.getTotalKm().compareTo(m1.getTotalKm());
      }
    };
  }

  private MemberRow toMemberRow(
      ChallengeMember member, Challenge challenge, BigDecimal goal, java.util.Set<UUID> rivalUserIds) {
    UUID memberUserId = member.getUser().getId();
    return new MemberRow(
        memberUserId,
        member.getUser().getNickname(),
        member.getTotalKm(),
        goal.subtract(member.getTotalKm()).max(BigDecimal.ZERO),
        challengeService.progressPercent(member, challenge),
        member.getFinishedAt() != null,
        IsoTime.formatOrNull(member.getFinishedAt()),
        member.getFinalRank(),
        rivalUserIds.contains(memberUserId));
  }
}
