package com.runrace.backend.challenge;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.ForbiddenTextChars;
import com.runrace.backend.challenge.dto.ChallengeWorkoutListItem;
import com.runrace.backend.challenge.dto.PendingApprovalResponse;
import com.runrace.backend.user.AppUser;
import com.runrace.backend.user.AppUserRepository;
import com.runrace.backend.workout.WorkoutEvents;
import com.runrace.backend.workout.WorkoutSession;
import com.runrace.backend.workout.WorkoutSessionRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
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
  private final IndoorRunApprovalRepository indoorRunApprovalRepository;
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

  @Transactional
  public ChallengeDetailView getDetail(Optional<UUID> currentUserId, Long id) {
    Challenge challenge = requireChallenge(id);
    List<ChallengeMember> members = challengeMemberRepository.findAllForChallenge(id);
    resolveWinnerIfNeeded(challenge, members);

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
        challenge.getWinner(),
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

  public BigDecimal goalKmAsDecimal(Challenge challenge) {
    return BigDecimal.valueOf(challenge.getGoalKm());
  }

  /**
   * 운동 기록 저장 시 호출. 사용자가 현재 참여 중인 진행 대결의 total_km을 distanceM만큼 증가시킨다.
   * - 대결 기간(startAt ~ endAt) 안에 있고 아직 승자가 없는 대결만 대상으로 한다.
   * - 목표 달성 시 완주 처리 및 승자 확정까지 함께 수행한다.
   */
  @Transactional
  public void applyWorkoutDistance(UUID userId, long workoutSessionId, int distanceM) {
    if (distanceM <= 0) return;
    BigDecimal distanceKm = BigDecimal.valueOf(distanceM)
        .divide(BigDecimal.valueOf(1000), 3, RoundingMode.HALF_UP);
    OffsetDateTime now = OffsetDateTime.now();

    List<ChallengeMember> activeMembers = challengeMemberRepository.findAllActiveForUser(userId, now);
    for (ChallengeMember member : activeMembers) {
      Challenge challenge = member.getChallenge();
      BigDecimal prevKm = member.getTotalKm();
      BigDecimal next = prevKm.add(distanceKm);
      BigDecimal goal = goalKmAsDecimal(challenge);

      // 순위 변동 감지: 업데이트 전 전체 멤버 조회
      List<ChallengeMember> allMembers = challengeMemberRepository.findAllForChallenge(challenge.getId());

      member.setTotalKm(next);
      member.setLastSyncAt(now);
      onMemberProgress(member, next);
      challengeMemberRepository.save(member);
      recordWorkoutLink(challenge, workoutSessionId, userId, distanceM, now);

      // 마일스톤 이벤트 발행
      publishMilestoneEvents(member, prevKm, next, goal, allMembers);

      // 순위 추월 이벤트 발행
      publishOvertakeEvent(member, prevKm, next, allMembers);
    }
  }

  private void publishMilestoneEvents(
      ChallengeMember member, BigDecimal prevKm, BigDecimal next,
      BigDecimal goal, List<ChallengeMember> allMembers) {

    String nickname = member.getUser().getNickname();
    UUID achieverId = member.getUser().getId();

    List<UUID> otherIds = allMembers.stream()
        .filter(m -> !m.getUser().getId().equals(achieverId))
        .filter(m -> m.getFinishedAt() == null)
        .map(m -> m.getUser().getId())
        .toList();

    if (otherIds.isEmpty()) return;

    for (int pct : new int[]{50, 80}) {
      BigDecimal threshold = goal.multiply(BigDecimal.valueOf(pct))
          .divide(HUNDRED, 3, RoundingMode.HALF_UP);
      if (prevKm.compareTo(threshold) < 0 && next.compareTo(threshold) >= 0) {
        eventPublisher.publishEvent(new MilestoneReachedEvent(
            member.getChallenge().getId(), achieverId, nickname, pct, otherIds));
      }
    }
  }

  private void publishOvertakeEvent(
      ChallengeMember member, BigDecimal prevKm, BigDecimal next,
      List<ChallengeMember> allMembers) {

    UUID overtakerId = member.getUser().getId();

    // prevKm < 상대방 km <= next 이면 추월 대상
    List<UUID> overtakenIds = allMembers.stream()
        .filter(m -> !m.getUser().getId().equals(overtakerId))
        .filter(m -> m.getTotalKm().compareTo(prevKm) > 0
                  && m.getTotalKm().compareTo(next) <= 0)
        .map(m -> m.getUser().getId())
        .toList();

    if (!overtakenIds.isEmpty()) {
      eventPublisher.publishEvent(new RankOvertakeEvent(
          member.getChallenge().getId(),
          overtakerId,
          member.getUser().getNickname(),
          overtakenIds));
    }
  }

  private void recordWorkoutLink(
      Challenge challenge, long workoutSessionId, UUID userId, int appliedDistanceM, OffsetDateTime now) {
    Long challengeId = challenge.getId();
    if (challengeWorkoutRepository.existsByChallengeIdAndWorkoutSessionId(challengeId, workoutSessionId)) {
      return;
    }
    ChallengeWorkout link = new ChallengeWorkout();
    link.setChallenge(challenge);
    link.setWorkoutSession(workoutSessionRepository.getReferenceById(workoutSessionId));
    link.setUser(appUserRepository.getReferenceById(userId));
    link.setAppliedDistanceM(appliedDistanceM);
    link.setCreatedAt(now);
    challengeWorkoutRepository.save(link);
  }

  /**
   * 운동 기록 삭제 시 호출. challenge_workout 링크를 찾아 적용된 거리를 총 거리에서 차감한다.
   * - 완주 처리된 멤버가 목표 이하로 내려가면 finishedAt을 초기화한다.
   * - 해당 멤버가 대결 승자였으면 winner도 초기화한다.
   */
  @Transactional
  public void reverseWorkoutDistance(long workoutSessionId) {
    List<ChallengeWorkout> links = challengeWorkoutRepository.findAllByWorkoutSessionId(workoutSessionId);
    for (ChallengeWorkout link : links) {
      // PENDING/REJECTED는 거리가 아직 반영되지 않았으므로 차감 불필요
      if (link.getApprovalStatus() != ApprovalStatus.APPROVED) {
        continue; // 아래 deleteAll에서 삭제됨
      }

      Challenge challenge = link.getChallenge();
      AppUser user = link.getUser();
      BigDecimal subtractKm = BigDecimal.valueOf(link.getAppliedDistanceM())
          .divide(BigDecimal.valueOf(1000), 3, RoundingMode.HALF_UP);

      challengeMemberRepository
          .findByChallengeIdAndUserId(challenge.getId(), user.getId())
          .ifPresent(member -> {
            BigDecimal next = member.getTotalKm().subtract(subtractKm).max(BigDecimal.ZERO);
            member.setTotalKm(next);
            member.setLastSyncAt(OffsetDateTime.now());

            // 목표 미달로 내려가면 완주 상태 초기화
            if (member.getFinishedAt() != null
                && next.compareTo(goalKmAsDecimal(challenge)) < 0) {
              member.setFinishedAt(null);
              challenge.setEnded(false);
              AppUser winner = challenge.getWinner();
              if (winner != null && winner.getId().equals(user.getId())) {
                challenge.setWinner(null);
              }
              challengeRepository.save(challenge);
            }
            challengeMemberRepository.save(member);
          });
    }
    if (!links.isEmpty()) {
      challengeWorkoutRepository.deleteAll(links);
    }
  }

  @Transactional(readOnly = true)
  public List<ChallengeWorkoutListItem> listWorkoutsForMembers(AuthPrincipal principal, Long challengeId) {
    Challenge challenge = requireChallenge(challengeId);
    ensureMemberOnly(principal.userId(), challenge);
    return challengeWorkoutRepository.findAllForChallengeOrderByStartedDesc(challengeId).stream()
        .map(this::toChallengeWorkoutListItem)
        .toList();
  }

  @Transactional(readOnly = true)
  public WorkoutSession getLinkedWorkoutForMember(
      AuthPrincipal principal, Long challengeId, Long workoutSessionId) {
    Challenge challenge = requireChallenge(challengeId);
    ensureMemberOnly(principal.userId(), challenge);
    challengeWorkoutRepository
        .findByChallengeIdAndWorkoutSessionId(challengeId, workoutSessionId)
        .orElseThrow(() -> ApiException.notFound("workout_not_found"));
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

  /**
   * 멤버 누적 거리가 목표를 처음 달성하면 완주 시각을 기록하고, 아직 승자가 없으면 승자로 확정한다.
   * 진행 중 트랜잭션 안에서 호출되는 것을 전제로 한다.
   */
  public void onMemberProgress(ChallengeMember member, BigDecimal nextTotalKm) {
    Challenge challenge = member.getChallenge();
    if (nextTotalKm.compareTo(goalKmAsDecimal(challenge)) >= 0 && member.getFinishedAt() == null) {
      member.setFinishedAt(OffsetDateTime.now());
      if (challenge.getWinner() == null) {
        challenge.setWinner(member.getUser());
      }
      boolean allOtherFinished = challengeMemberRepository.findAllForChallenge(challenge.getId()).stream()
          .filter(m -> !m.getId().equals(member.getId()))
          .allMatch(m -> m.getFinishedAt() != null);
      if (allOtherFinished) {
        challenge.setEnded(true);
      }
      challengeRepository.save(challenge);
    }
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

  /** 승자가 비어 있으면 첫 완주자를, 종료 후라면 최상위 멤버를 승자로 확정한다. */
  private void resolveWinnerIfNeeded(Challenge challenge, List<ChallengeMember> members) {
    if (challenge.getWinner() != null) {
      return;
    }

    Optional<ChallengeMember> firstFinisher =
        members.stream()
            .filter(m -> m.getFinishedAt() != null)
            .min(Comparator.comparing(ChallengeMember::getFinishedAt));
    if (firstFinisher.isPresent()) {
      assignWinner(challenge, firstFinisher.get());
      return;
    }

    OffsetDateTime now = OffsetDateTime.now();
    if (challenge.getEndAt() != null && now.isAfter(challenge.getEndAt()) && !members.isEmpty()) {
      ChallengeMember top =
          members.stream()
              .max(
                  Comparator.comparing(ChallengeMember::getTotalKm)
                      .thenComparing(
                          m -> m.getFinishedAt() == null ? OffsetDateTime.MAX : m.getFinishedAt(),
                          Comparator.reverseOrder()))
              .orElseThrow();
      assignWinner(challenge, top);
    }
  }

  private void assignWinner(Challenge challenge, ChallengeMember member) {
    challenge.setWinner(member.getUser());
    challengeRepository.save(challenge);
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

  /** 실내러닝 — 레이스별 PENDING ChallengeWorkout + 개별 승인 행 생성. */
  @Transactional
  public void createPendingIndoorApprovals(UUID userId, WorkoutSession session, int distanceM) {
    if (distanceM <= 0) return;
    OffsetDateTime now = OffsetDateTime.now();
    List<ChallengeMember> activeMembers = challengeMemberRepository.findAllActiveForUser(userId, now);

    for (ChallengeMember member : activeMembers) {
      Challenge challenge = member.getChallenge();
      if (challengeWorkoutRepository.existsByChallengeIdAndWorkoutSessionId(
          challenge.getId(), session.getId())) continue;

      ChallengeWorkout cw = new ChallengeWorkout();
      cw.setChallenge(challenge);
      cw.setWorkoutSession(session);
      cw.setUser(member.getUser());
      cw.setAppliedDistanceM(distanceM);
      cw.setApprovalStatus(ApprovalStatus.PENDING);
      cw.setCreatedAt(now);
      ChallengeWorkout saved = challengeWorkoutRepository.save(cw);

      List<ChallengeMember> allMembers = challengeMemberRepository.findAllForChallenge(challenge.getId());
      List<UUID> voterIds = new ArrayList<>();
      for (ChallengeMember voter : allMembers) {
        if (voter.getUser().getId().equals(userId)) continue;
        IndoorRunApproval approval = new IndoorRunApproval();
        approval.setChallengeWorkout(saved);
        approval.setVoter(voter.getUser());
        approval.setCreatedAt(now);
        indoorRunApprovalRepository.save(approval);
        voterIds.add(voter.getUser().getId());
      }

      // 투표자가 없으면(혼자 참가 중) 즉시 승인
      if (voterIds.isEmpty()) {
        saved.setApprovalStatus(ApprovalStatus.APPROVED);
        challengeWorkoutRepository.save(saved);
        applyApprovedIndoorRun(saved.getId());
      } else {
        String nickname = member.getUser().getNickname();
        eventPublisher.publishEvent(new WorkoutEvents.IndoorRunPendingApprovalEvent(
            saved.getId(), challenge.getId(), userId, voterIds, nickname));
      }
    }
  }

  /** 전원 승인 시 호출 — 거리를 레이스 멤버 기록에 반영한다. */
  @Transactional
  public void applyApprovedIndoorRun(Long challengeWorkoutId) {
    ChallengeWorkout cw = challengeWorkoutRepository.findById(challengeWorkoutId)
        .orElseThrow(() -> ApiException.notFound("challenge_workout_not_found"));

    cw.setApprovalStatus(ApprovalStatus.APPROVED);
    challengeWorkoutRepository.save(cw);

    Challenge challenge = cw.getChallenge();
    UUID userId = cw.getUser().getId();
    BigDecimal distanceKm = BigDecimal.valueOf(cw.getAppliedDistanceM())
        .divide(BigDecimal.valueOf(1000), 3, RoundingMode.HALF_UP);
    OffsetDateTime now = OffsetDateTime.now();

    challengeMemberRepository.findByChallengeIdAndUserId(challenge.getId(), userId)
        .ifPresent(member -> {
          BigDecimal prevKm = member.getTotalKm();
          BigDecimal next = prevKm.add(distanceKm);
          BigDecimal goal = goalKmAsDecimal(challenge);
          List<ChallengeMember> allMembers = challengeMemberRepository.findAllForChallenge(challenge.getId());
          member.setTotalKm(next);
          member.setLastSyncAt(now);
          onMemberProgress(member, next);
          challengeMemberRepository.save(member);
          publishMilestoneEvents(member, prevKm, next, goal, allMembers);
          publishOvertakeEvent(member, prevKm, next, allMembers);
        });

    eventPublisher.publishEvent(new WorkoutEvents.IndoorRunApprovedEvent(challengeWorkoutId, userId));
  }

  /** 레이스의 승인 대기 중인 실내러닝 목록. */
  @Transactional(readOnly = true)
  public List<PendingApprovalResponse> getPendingApprovals(Long challengeId, UUID viewerUserId) {
    List<ChallengeWorkout> pending = challengeWorkoutRepository
        .findAllByChallengeIdAndApprovalStatus(challengeId, ApprovalStatus.PENDING);

    return pending.stream().map(cw -> {
      WorkoutSession ws = cw.getWorkoutSession();
      List<IndoorRunApproval> votes = indoorRunApprovalRepository.findAllByChallengeWorkoutId(cw.getId());
      long approvedCount = votes.stream().filter(v -> Boolean.TRUE.equals(v.getApproved())).count();
      Boolean myVote = votes.stream()
          .filter(v -> v.getVoter().getId().equals(viewerUserId))
          .map(IndoorRunApproval::getApproved)
          .findFirst()
          .orElse(null);
      // myVote==null means: either viewer is submitter, or hasn't voted yet
      // distinguish: if voter row exists -> pending; if no row -> not a voter (submitter)
      boolean isVoter = votes.stream().anyMatch(v -> v.getVoter().getId().equals(viewerUserId));
      Boolean myVoteFinal = isVoter ? myVote : null;

      return new PendingApprovalResponse(
          cw.getId(),
          ws.getId(),
          cw.getUser().getNickname(),
          ws.getDistanceM(),
          ws.getDurationSec(),
          ws.getAvgPaceSecPerKm(),
          ws.getImageUrl(),
          ws.getStartedAt().toString(),
          myVoteFinal,
          votes.size(),
          (int) approvedCount
      );
    }).toList();
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
