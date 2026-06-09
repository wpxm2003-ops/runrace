package com.runrace.backend.challenge;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.ForbiddenTextChars;
import com.runrace.backend.challenge.dto.ChallengeWorkoutListItem;
import com.runrace.backend.user.AppUser;
import com.runrace.backend.user.AppUserRepository;
import com.runrace.backend.workout.WorkoutSession;
import com.runrace.backend.workout.WorkoutSessionRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 대결 방 관리 — 생성/수정/삭제/참가/탈퇴, 목록·상세 조회, 승자 확정.
 * 누적 거리 반영은 {@link ChallengeProgressService}, 실내러닝 승인은 {@link IndoorApprovalService}.
 */
@Service
@RequiredArgsConstructor
public class ChallengeService {
  static final int MAX_ACTIVE_ROOMS_PER_CREATOR = 3;
  private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

  private final AppUserRepository appUserRepository;
  private final ChallengeRepository challengeRepository;
  private final ChallengeMemberRepository challengeMemberRepository;
  private final ChallengeWorkoutRepository challengeWorkoutRepository;
  private final WorkoutSessionRepository workoutSessionRepository;
  private final ApplicationEventPublisher eventPublisher;

  @Transactional
  public Challenge createRoom(
      AuthPrincipal principal,
      String title,
      int goalKm,
      int maxMembers,
      OffsetDateTime startAt,
      OffsetDateTime endAt) {
    validateRoomInput(title, goalKm, maxMembers, startAt, endAt);

    AppUser creator = appUserRepository.getRequired(principal.userId());
    if (challengeRepository.countActiveByCreator(creator.getId(), OffsetDateTime.now())
        >= MAX_ACTIVE_ROOMS_PER_CREATOR) {
      throw ApiException.conflict("active_room_limit");
    }

    Challenge challenge = new Challenge();
    challenge.setCreator(creator);
    challenge.setCreatedAt(OffsetDateTime.now());
    applyRoomInput(challenge, title, goalKm, maxMembers, startAt, endAt);
    Challenge saved = challengeRepository.save(challenge);

    challengeMemberRepository.save(newMember(saved, creator));

    eventPublisher.publishEvent(new ChallengeCreatedEvent(saved.getId(), creator.getId()));
    return saved;
  }

  @Transactional
  public Challenge updateRoom(
      AuthPrincipal principal,
      Long id,
      String title,
      int goalKm,
      int maxMembers,
      OffsetDateTime startAt,
      OffsetDateTime endAt) {
    Challenge challenge = requireChallenge(id);
    ensureOwner(principal, challenge);
    ensureNotStarted(challenge);
    validateRoomInput(title, goalKm, maxMembers, startAt, endAt);

    if (maxMembers < challengeMemberRepository.countByChallengeId(id)) {
      throw ApiException.badRequest("max_members_too_small");
    }

    applyRoomInput(challenge, title, goalKm, maxMembers, startAt, endAt);
    return challengeRepository.save(challenge);
  }

  @Transactional
  public void deleteRoom(AuthPrincipal principal, Long id) {
    Challenge challenge = requireChallenge(id);
    ensureOwner(principal, challenge);
    ensureNotStarted(challenge);
    challengeRepository.delete(challenge);
  }

  @Transactional
  public void joinRoom(AuthPrincipal principal, Long id) {
    Challenge challenge =
        challengeRepository.findById(id).orElseThrow(() -> ApiException.notFound("challenge_not_found"));
    ensureNotStarted(challenge);
    if (isEnded(challenge, OffsetDateTime.now())) {
      throw ApiException.conflict("ended");
    }
    if (challengeMemberRepository.findByChallengeIdAndUserId(id, principal.userId()).isPresent()) {
      throw ApiException.conflict("already_member");
    }
    if (challengeMemberRepository.countByChallengeId(id) >= challenge.getMaxMembers()) {
      throw ApiException.conflict("room_full");
    }

    AppUser me = appUserRepository.getRequired(principal.userId());
    challengeMemberRepository.save(newMember(challenge, me));
  }

  @Transactional
  public void leaveRoom(AuthPrincipal principal, Long id) {
    Challenge challenge =
        challengeRepository.findById(id).orElseThrow(() -> ApiException.notFound("challenge_not_found"));
    ensureNotStarted(challenge);
    if (isEnded(challenge, OffsetDateTime.now())) {
      throw ApiException.conflict("ended");
    }
    if (challenge.getCreator().getId().equals(principal.userId())) {
      throw ApiException.badRequest("owner_cannot_leave");
    }
    ChallengeMember member =
        challengeMemberRepository
            .findByChallengeIdAndUserId(id, principal.userId())
            .orElseThrow(() -> ApiException.notFound("not_member"));
    challengeMemberRepository.delete(member);
  }

  @Transactional(readOnly = true)
  public List<Challenge> listAll() {
    OffsetDateTime now = OffsetDateTime.now();
    return challengeRepository.findAllWithCreator().stream()
        .sorted(
            Comparator.comparingInt((Challenge c) -> ChallengePhase.of(c, now).ordinal())
                .thenComparing(Challenge::getStartAt)
                .thenComparing(Challenge::getId))
        .toList();
  }

  @Transactional(readOnly = true)
  public List<Challenge> listForMe(AuthPrincipal principal) {
    OffsetDateTime now = OffsetDateTime.now();
    return challengeRepository.findAllForUser(principal.userId()).stream()
        .sorted(
            Comparator.comparingInt((Challenge c) -> ChallengePhase.of(c, now).ordinal())
                .thenComparing(Challenge::getStartAt, Comparator.reverseOrder())
                .thenComparing(Challenge::getId, Comparator.reverseOrder()))
        .toList();
  }

  @Transactional(readOnly = true)
  public long countActiveRoomsForCreator(AuthPrincipal principal) {
    return challengeRepository.countActiveByCreator(principal.userId(), OffsetDateTime.now());
  }

  @Transactional(readOnly = true)
  public ChallengeDetailView getDetail(Optional<UUID> currentUserId, Long id) {
    Challenge challenge = requireChallenge(id);
    List<ChallengeMember> members = challengeMemberRepository.findAllForChallenge(id);
    AppUser winner = resolveWinnerForDisplay(challenge, members);

    UUID userId = currentUserId.orElse(null);
    boolean isMember =
        userId != null
            && challengeMemberRepository.findByChallengeIdAndUserId(id, userId).isPresent();
    boolean isOwner = userId != null && challenge.getCreator().getId().equals(userId);
    OffsetDateTime now = OffsetDateTime.now();

    return new ChallengeDetailView(
        challenge,
        members,
        userId,
        isMember,
        isOwner,
        hasStarted(challenge, now),
        isEnded(challenge, now),
        winner,
        members.size());
  }

  @Transactional(readOnly = true)
  public List<UUID> listMemberUserIds(Long challengeId) {
    return challengeMemberRepository.findAllForChallenge(challengeId).stream()
        .map(member -> member.getUser().getId())
        .toList();
  }

  /**
   * 여러 챌린지의 멤버 수를 단일 쿼리로 일괄 조회한다.
   * 챌린지 목록 API에서 챌린지별 개별 쿼리(N+1)를 방지한다.
   */
  @Transactional(readOnly = true)
  public Map<Long, Long> batchMemberCounts(List<Long> challengeIds) {
    if (challengeIds.isEmpty()) {
      return Map.of();
    }
    return challengeMemberRepository.countsByChallengeIdIn(challengeIds).stream()
        .collect(Collectors.toMap(
            row -> (Long) row[0],
            row -> (Long) row[1]));
  }

  public static BigDecimal goalKmAsDecimal(Challenge challenge) {
    return BigDecimal.valueOf(challenge.getGoalKm());
  }

  @Transactional(readOnly = true)
  public List<ChallengeWorkoutListItem> listWorkoutsForMembers(AuthPrincipal principal, Long challengeId) {
    Challenge challenge = requireChallenge(challengeId);
    ensureMemberOnly(principal.userId(), challenge);
    return challengeWorkoutRepository
        .findAllByChallengeIdAndApprovalStatusOrderByStartedDesc(challengeId, ApprovalStatus.APPROVED)
        .stream()
        .map(this::toChallengeWorkoutListItem)
        .toList();
  }

  @Transactional(readOnly = true)
  public WorkoutSession getLinkedWorkoutForMember(
      AuthPrincipal principal, Long challengeId, Long workoutSessionId) {
    Challenge challenge = requireChallenge(challengeId);
    ensureMemberOnly(principal.userId(), challenge);
    ChallengeWorkout link = challengeWorkoutRepository
        .findByChallengeIdAndWorkoutSessionId(challengeId, workoutSessionId)
        .orElseThrow(() -> ApiException.notFound("workout_not_found"));
    if (link.getApprovalStatus() != ApprovalStatus.APPROVED) {
      throw ApiException.notFound("workout_not_found");
    }
    return workoutSessionRepository
        .findById(workoutSessionId)
        .orElseThrow(() -> ApiException.notFound("workout_not_found"));
  }

  private void ensureMemberOnly(UUID userId, Challenge challenge) {
    if (challengeMemberRepository.findByChallengeIdAndUserId(challenge.getId(), userId).isEmpty()) {
      throw ApiException.forbidden("forbidden");
    }
  }

  private ChallengeWorkoutListItem toChallengeWorkoutListItem(ChallengeWorkout link) {
    WorkoutSession session = link.getWorkoutSession();
    AppUser user = session.getUser();
    return new ChallengeWorkoutListItem(
        session.getId(),
        user.getId(),
        user.getNickname(),
        session.getStartedAt().toString(),
        session.getEndedAt().toString(),
        session.getDurationSec(),
        session.getDistanceM(),
        link.getAppliedDistanceM());
  }

  public BigDecimal progressPercent(ChallengeMember member, Challenge challenge) {
    if (challenge.getGoalKm() == null || challenge.getGoalKm() <= 0) {
      return BigDecimal.ZERO;
    }
    return member
        .getTotalKm()
        .multiply(HUNDRED)
        .divide(goalKmAsDecimal(challenge), 1, RoundingMode.HALF_UP)
        .min(HUNDRED);
  }

  public static boolean hasStarted(Challenge challenge, OffsetDateTime now) {
    return !now.isBefore(challenge.getStartAt());
  }

  public static boolean isEnded(Challenge challenge, OffsetDateTime now) {
    if (challenge.isEnded()) {
      return true;
    }
    return challenge.getEndAt() != null && now.isAfter(challenge.getEndAt());
  }

  /**
   * 표시용 승자 계산 — 영속화하지 않는다(읽기 경로 부작용 제거).
   * - 이미 확정된 승자가 있으면 그대로 사용(완주 시 onMemberProgress가 확정).
   * - 첫 완주자가 있으면 그 사람.
   * - 완주자 없이 기간이 종료됐으면 누적 거리 최상위 멤버.
   */
  private AppUser resolveWinnerForDisplay(Challenge challenge, List<ChallengeMember> members) {
    if (challenge.getWinner() != null) {
      return challenge.getWinner();
    }

    Optional<ChallengeMember> firstFinisher =
        members.stream()
            .filter(m -> m.getFinishedAt() != null)
            .min(Comparator.comparing(ChallengeMember::getFinishedAt));
    if (firstFinisher.isPresent()) {
      return firstFinisher.get().getUser();
    }

    OffsetDateTime now = OffsetDateTime.now();
    if (challenge.getEndAt() != null && now.isAfter(challenge.getEndAt()) && !members.isEmpty()) {
      return members.stream()
          .max(
              Comparator.comparing(ChallengeMember::getTotalKm)
                  .thenComparing(
                      m -> m.getFinishedAt() == null ? OffsetDateTime.MAX : m.getFinishedAt(),
                      Comparator.reverseOrder()))
          .map(ChallengeMember::getUser)
          .orElse(null);
    }
    return null;
  }

  private Challenge requireChallenge(Long id) {
    return challengeRepository
        .findByIdWithDetails(id)
        .orElseThrow(() -> ApiException.notFound("challenge_not_found"));
  }

  private ChallengeMember newMember(Challenge challenge, AppUser user) {
    ChallengeMember member = new ChallengeMember();
    member.setChallenge(challenge);
    member.setUser(user);
    member.setTotalKm(BigDecimal.ZERO);
    return member;
  }

  private void applyRoomInput(
      Challenge challenge,
      String title,
      int goalKm,
      int maxMembers,
      OffsetDateTime startAt,
      OffsetDateTime endAt) {
    challenge.setTitle(title.trim());
    challenge.setGoalKm(goalKm);
    challenge.setMaxMembers(maxMembers);
    challenge.setStartAt(startAt);
    challenge.setEndAt(endAt);
  }

  private static final int TITLE_MAX_BYTES = 50;
  private static final int MAX_GOAL_KM = 1000;
  private static final int MAX_MEMBERS_LIMIT = 50;
  private void validateRoomInput(
      String title,
      int goalKm,
      int maxMembers,
      OffsetDateTime startAt,
      OffsetDateTime endAt) {
    String trimmed = title == null ? "" : title.trim();
    if (trimmed.isBlank() || utf8ByteLength(trimmed) > TITLE_MAX_BYTES) {
      throw ApiException.badRequest("invalid_title");
    }
    if (ForbiddenTextChars.containsForbidden(trimmed)) {
      throw ApiException.badRequest("invalid_title_chars");
    }
    if (goalKm < 1 || goalKm > MAX_GOAL_KM) {
      throw ApiException.badRequest("invalid_goal_km");
    }
    if (maxMembers < 1 || maxMembers > MAX_MEMBERS_LIMIT) {
      throw ApiException.badRequest("invalid_max_members");
    }
    if (startAt == null || endAt == null) {
      throw ApiException.badRequest("invalid_dates");
    }
    OffsetDateTime nowMinute = OffsetDateTime.now().truncatedTo(ChronoUnit.MINUTES);
    if (startAt.truncatedTo(ChronoUnit.MINUTES).isBefore(nowMinute)) {
      throw ApiException.badRequest("invalid_start_at");
    }
    if (!endAt.isAfter(startAt)) {
      throw ApiException.badRequest("invalid_date_range");
    }
  }

  private static int utf8ByteLength(String value) {
    return value.getBytes(StandardCharsets.UTF_8).length;
  }

  private void ensureOwner(AuthPrincipal principal, Challenge challenge) {
    if (!challenge.getCreator().getId().equals(principal.userId())) {
      throw ApiException.forbidden("forbidden");
    }
  }

  private void ensureNotStarted(Challenge challenge) {
    if (hasStarted(challenge, OffsetDateTime.now())) {
      throw ApiException.conflict("already_started");
    }
  }

  public record ChallengeDetailView(
      Challenge challenge,
      List<ChallengeMember> members,
      UUID currentUserId,
      boolean isMember,
      boolean isOwner,
      boolean hasStarted,
      boolean hasEnded,
      AppUser winner,
      int memberCount) {}
}
