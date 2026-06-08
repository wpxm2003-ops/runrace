package com.runrace.backend.challenge;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.dto.ActiveCountResponse;
import com.runrace.backend.challenge.dto.ChallengeDetailResponse;
import com.runrace.backend.challenge.dto.ChallengeListItem;
import com.runrace.backend.challenge.dto.CreateChallengeRequest;
import com.runrace.backend.challenge.dto.CreateChallengeResponse;
import com.runrace.backend.challenge.dto.MemberRow;
import com.runrace.backend.challenge.dto.PendingApprovalResponse;
import com.runrace.backend.challenge.dto.UpdateChallengeRequest;
import com.runrace.backend.challenge.dto.ChallengeWorkoutListItem;
import com.runrace.backend.challenge.dto.WinnerRow;
import com.runrace.backend.workout.WorkoutService;
import com.runrace.backend.workout.WorkoutSession;
import com.runrace.backend.workout.dto.PathPointDto;
import com.runrace.backend.workout.dto.WorkoutDetailResponse;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.Map;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/challenges")
@RequiredArgsConstructor
public class ChallengeController {
  private static final String ID_PATH = "[0-9]+";

  private final ChallengeService challengeService;
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
            OffsetDateTime.parse(body.endAt()));
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
  public ResponseEntity<List<ChallengeListItem>> list(Optional<AuthPrincipal> principal) {
    Optional<UUID> userId = principal.map(AuthPrincipal::userId);
    OffsetDateTime now = OffsetDateTime.now();
    List<Challenge> challenges = challengeService.listAll();

    Map<Long, Long> memberCounts = challengeService.batchMemberCounts(
        challenges.stream().map(Challenge::getId).toList());

    List<ChallengeListItem> items = challenges.stream()
        .map(challenge -> toListItem(challenge, now, userId, memberCounts))
        .toList();
    return ResponseEntity.ok(items);
  }

  @GetMapping("/mine")
  public ResponseEntity<List<ChallengeListItem>> listMine(AuthPrincipal principal) {
    OffsetDateTime now = OffsetDateTime.now();
    UUID userId = principal.userId();
    List<Challenge> challenges = challengeService.listForMe(principal);
    Map<Long, Long> memberCounts = challengeService.batchMemberCounts(
        challenges.stream().map(Challenge::getId).toList());
    List<ChallengeListItem> items = challenges.stream()
        .map(challenge -> toListItem(challenge, now, Optional.of(userId), memberCounts))
        .toList();
    return ResponseEntity.ok(items);
  }

  @GetMapping("/{id:" + ID_PATH + "}")
  public ResponseEntity<ChallengeDetailResponse> detail(
      Optional<AuthPrincipal> principal, @PathVariable("id") Long id) {
    ChallengeService.ChallengeDetailView detail =
        challengeService.getDetail(principal.map(AuthPrincipal::userId), id);
    return ResponseEntity.ok(toDetailResponse(detail));
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
    List<PathPointDto> path =
        workoutService.parsePath(session.getPathJson()).stream()
            .map(p -> new PathPointDto(p.lat(), p.lng()))
            .toList();
    return ResponseEntity.ok(
        new WorkoutDetailResponse(
            session.getId(),
            session.getStartedAt().toString(),
            session.getEndedAt().toString(),
            session.getDurationSec(),
            session.getDistanceM(),
            session.getCalories(),
            session.getAvgPaceSecPerKm(),
            path,
            session.getWorkoutType().name(),
            session.getImageUrl()));
  }

  /** 레이스 승인 대기 중인 실내러닝 목록. */
  @GetMapping("/{id:[0-9]+}/pending-approvals")
  public ResponseEntity<List<PendingApprovalResponse>> pendingApprovals(
      AuthPrincipal principal, @PathVariable("id") Long id) {
    return ResponseEntity.ok(challengeService.getPendingApprovals(id, principal.userId()));
  }

  private ChallengeListItem toListItem(
      Challenge challenge,
      OffsetDateTime now,
      Optional<UUID> currentUserId,
      Map<Long, Long> memberCounts) {
    ChallengePhase phase = ChallengePhase.of(challenge, now);
    boolean isOwner =
        currentUserId.map(uid -> challenge.getCreator().getId().equals(uid)).orElse(false);
    int memberCount = memberCounts.getOrDefault(challenge.getId(), 0L).intValue();
    return new ChallengeListItem(
        challenge.getId(),
        challenge.getTitle(),
        challenge.getGoalKm(),
        phase.name(),
        challenge.getStartAt().toString(),
        toIsoOrNull(challenge.getEndAt()),
        memberCount,
        challenge.getCreatedAt().toString(),
        isOwner);
  }

  private ChallengeDetailResponse toDetailResponse(ChallengeService.ChallengeDetailView detail) {
    Challenge challenge = detail.challenge();
    BigDecimal goal = challengeService.goalKmAsDecimal(challenge);

    List<MemberRow> rows =
        detail.members().stream()
            .sorted((m1, m2) -> {
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
            })
            .map(member -> toMemberRow(member, challenge, goal))
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
        challenge.getStartAt().toString(),
        toIsoOrNull(challenge.getEndAt()),
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

  private MemberRow toMemberRow(ChallengeMember member, Challenge challenge, BigDecimal goal) {
    return new MemberRow(
        member.getUser().getId(),
        member.getUser().getNickname(),
        member.getUser().getPhotoUrl(),
        member.getTotalKm(),
        goal.subtract(member.getTotalKm()).max(BigDecimal.ZERO),
        challengeService.progressPercent(member, challenge),
        member.getFinishedAt() != null);
  }

  private static String toIsoOrNull(OffsetDateTime value) {
    return value != null ? value.toString() : null;
  }
}
