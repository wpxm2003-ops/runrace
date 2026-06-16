package com.runrace.backend.challenge;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.IsoTime;
import com.runrace.backend.common.SupportedLanguages;
import com.runrace.backend.common.TextValidation;
import com.runrace.backend.challenge.dto.ChallengeWorkoutListItem;
import com.runrace.backend.challenge.dto.HeadToHeadRow;
import com.runrace.backend.rival.RivalRepository;
import com.runrace.backend.user.AppUser;
import com.runrace.backend.user.AppUserRepository;
import com.runrace.backend.workout.WorkoutSession;
import com.runrace.backend.workout.WorkoutSessionRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 레이스 방 관리 — 생성/수정/삭제/참가/탈퇴, 목록·상세 조회, 승자 확정.
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
  private final RivalRepository rivalRepository;

  @Transactional
  public Challenge createRoom(
      AuthPrincipal principal,
      String title,
      BigDecimal goalKm,
      int maxMembers,
      OffsetDateTime startAt,
      OffsetDateTime endAt,
      String langCd) {
    validateRoomInput(title, goalKm, maxMembers, startAt, endAt);

    AppUser creator = appUserRepository.getRequired(principal.userId());
    if (challengeRepository.countActiveByCreator(creator.getId(), OffsetDateTime.now())
        >= MAX_ACTIVE_ROOMS_PER_CREATOR) {
      throw ApiException.conflict("active_room_limit");
    }

    Challenge challenge = Challenge.builder()
        .creator(creator)
        .createdAt(OffsetDateTime.now())
        // 언어는 생성 시점에만 고정한다(수정 시 변경하지 않음).
        .langCd(SupportedLanguages.normalizeOrDefault(langCd))
        .title(title.trim())
        .goalKm(goalKm.setScale(3, RoundingMode.HALF_UP))
        .maxMembers(maxMembers)
        .startAt(startAt)
        .endAt(endAt)
        .build();
    Challenge saved = challengeRepository.save(challenge);

    challengeMemberRepository.save(newMember(saved, creator));

    return saved;
  }

  @Transactional
  public Challenge updateRoom(
      AuthPrincipal principal,
      Long id,
      String title,
      BigDecimal goalKm,
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

    challenge.updateRoom(title.trim(), goalKm.setScale(3, RoundingMode.HALF_UP), maxMembers, startAt, endAt);
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
    try {
      challengeMemberRepository.saveAndFlush(newMember(challenge, me));
    } catch (org.springframework.dao.DataIntegrityViolationException e) {
      // 동시 중복 참여 — 유니크 제약 위반을 깔끔한 4xx로 변환
      throw ApiException.conflict("already_member");
    }
  }

  @Transactional
  public void leaveRoom(AuthPrincipal principal, Long id) {
    Challenge challenge =
        challengeRepository.findById(id).orElseThrow(() -> ApiException.notFound("challenge_not_found"));
    ensureNotStarted(challenge);
    if (isEnded(challenge, OffsetDateTime.now())) {
      throw ApiException.conflict("ended");
    }
    if (challenge.isOwner(principal.userId())) {
      throw ApiException.badRequest("owner_cannot_leave");
    }
    ChallengeMember member =
        challengeMemberRepository
            .findByChallengeIdAndUserId(id, principal.userId())
            .orElseThrow(() -> ApiException.notFound("not_member"));
    challengeMemberRepository.delete(member);
  }

  /**
   * 공개 목록. lang이 지원 언어면 해당 언어방만, 그 외(null·빈값·"all")는 전체를 반환한다(소프트 필터).
   */
  /**
   * 공개 목록 페이지. phase(all/scheduled/in_progress/ended) 필터 + 언어(soft) + 페이징.
   * 참여자 1명짜리 종료방 숨김·정렬은 쿼리에서 처리한다.
   */
  @Transactional(readOnly = true)
  public Slice<Challenge> listPublicPage(String lang, String phase, int page, int size) {
    String langFilter = SupportedLanguages.isSupported(lang) ? lang : null;
    return challengeRepository.findPublicPage(
        langFilter, normalizePhase(phase), OffsetDateTime.now(), PageRequest.of(page, size));
  }

  /** 주어진 레이스들 중 사용자가 참여 중인 것의 id 집합 — 공개 목록 "참여" 라벨용. */
  @Transactional(readOnly = true)
  public Set<Long> memberChallengeIds(UUID userId, List<Long> challengeIds) {
    if (challengeIds.isEmpty()) return Set.of();
    return Set.copyOf(challengeMemberRepository.findMemberChallengeIds(userId, challengeIds));
  }

  /** 내가 참여한 레이스 페이지. phase(all/active/ended) 필터 + 페이징. */
  @Transactional(readOnly = true)
  public Slice<Challenge> listMinePage(UUID userId, String phase, int page, int size) {
    return challengeRepository.findMinePage(
        userId, normalizePhase(phase), OffsetDateTime.now(), PageRequest.of(page, size));
  }

  private static String normalizePhase(String phase) {
    return ("active".equals(phase) || "scheduled".equals(phase)
            || "in_progress".equals(phase) || "ended".equals(phase))
        ? phase
        : "all";
  }


  @Transactional(readOnly = true)
  public long countActiveRoomsForCreator(AuthPrincipal principal) {
    return challengeRepository.countActiveByCreator(principal.userId(), OffsetDateTime.now());
  }

  /**
   * 시작됐는데 참여자가 1명 이하(방장 혼자)인 레이스를 삭제한다.
   * 스케줄러·운동 반영 등 접근 시점에 호출되어 정리를 보장한다.
   * 시작 전(모집 중)이거나 이미 종료됐거나 2명 이상이면 아무것도 하지 않는다.
   * 호출 측의 (읽기 전용이 아닌) 트랜잭션 안에서 실행되는 것을 전제로 한다. 삭제했으면 true.
   */
  public boolean deleteIfSolo(Challenge challenge, OffsetDateTime now) {
    if (challenge.isEnded()) return false;
    if (!hasStarted(challenge, now)) return false; // 모집 중(SCHEDULED)은 유지
    if (challengeMemberRepository.countByChallengeId(challenge.getId()) > 1) return false;
    Long challengeId = challenge.getId();
    UUID creatorId = challenge.getCreator().getId();
    challengeRepository.delete(challenge);
    eventPublisher.publishEvent(new ChallengeEndedNoParticipantsEvent(challengeId, creatorId));
    return true;
  }

  /**
   * 기간(endAt)이 지난 레이스를 확정한다: 상태 ENDED + 우승자 영속화.
   * 지금까지 읽기 시점에만 계산하던 종료/우승을 실제 DB에 박는다(스케줄러에서 호출).
   * 호출 측의 (읽기 전용이 아닌) 트랜잭션 안에서 실행되는 것을 전제로 한다. 확정했으면 true.
   */
  public boolean finalizeIfTimeEnded(Challenge challenge, OffsetDateTime now) {
    if (challenge.isEnded()) return false;
    if (challenge.getEndAt() == null || !now.isAfter(challenge.getEndAt())) return false;
    List<ChallengeMember> members = challengeMemberRepository.findAllForChallenge(challenge.getId());
    AppUser winner = resolveWinnerForDisplay(challenge, members);
    challenge.end();
    if (winner != null) challenge.declareWinner(winner);
    challengeRepository.save(challenge);
    // 실제로 뛴 사람이 있을 때만 순위를 확정한다.
    // 아무도 0km이면 순위 미부여 → head-to-head 전적에 반영되지 않는다.
    boolean anyRan = members.stream().anyMatch(m -> m.getTotalKm().compareTo(BigDecimal.ZERO) > 0);
    if (anyRan) {
      assignFinalRanks(members);
    }
    eventPublisher.publishEvent(new ChallengeEndedEvent(
        challenge.getId(),
        winner != null ? winner.getNickname() : null,
        members.stream().map(m -> m.getUser().getId()).toList()));
    return true;
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
    boolean isOwner = challenge.isOwner(userId);
    OffsetDateTime now = OffsetDateTime.now();

    // 로그인 사용자가 등록한 라이벌이 이 방에 있으면 표시(색/라벨)용으로 id 집합을 넘긴다.
    Set<UUID> rivalUserIds =
        userId == null ? Set.of() : new HashSet<>(rivalRepository.findRivalUserIds(userId));

    return new ChallengeDetailView(
        challenge,
        members,
        userId,
        isMember,
        isOwner,
        hasStarted(challenge, now),
        isEnded(challenge, now),
        winner,
        members.size(),
        rivalUserIds);
  }

  /**
   * 현재 사용자(meId) 기준, 이 레이스 참여자 중 "내 라이벌"과의 누적 전적.
   * 라이벌이 아닌 참여자는 결과에 포함하지 않는다(전적은 라이벌에게만 노출).
   */
  @Transactional(readOnly = true)
  public List<HeadToHeadRow> headToHead(UUID meId, Long challengeId) {
    Set<UUID> rivalIds = new HashSet<>(rivalRepository.findRivalUserIds(meId));
    if (rivalIds.isEmpty()) {
      return List.of();
    }
    List<UUID> rivalParticipants =
        challengeMemberRepository.findAllForChallenge(challengeId).stream()
            .map(m -> m.getUser().getId())
            .filter(rivalIds::contains)
            .toList();
    if (rivalParticipants.isEmpty()) {
      return List.of();
    }
    Map<UUID, int[]> agg = new HashMap<>();
    for (var pair : challengeMemberRepository.findHeadToHeadPairs(meId, rivalParticipants)) {
      int[] wl = agg.computeIfAbsent(pair.opponentId(), k -> new int[2]);
      if (pair.myRank() < pair.opRank()) {
        wl[0]++;
      } else if (pair.myRank() > pair.opRank()) {
        wl[1]++;
      }
    }
    return rivalParticipants.stream()
        .map(uid -> {
          int[] wl = agg.getOrDefault(uid, new int[] {0, 0});
          return new HeadToHeadRow(uid, wl[0], wl[1]);
        })
        .toList();
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
    return challengeMemberRepository.memberCountsByChallengeId(challengeIds);
  }

  public static BigDecimal goalKmAsDecimal(Challenge challenge) {
    return challenge.getGoalKm();
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
        IsoTime.format(session.getStartedAt()),
        IsoTime.format(session.getEndedAt()),
        session.getDurationSec(),
        session.getDistanceM(),
        link.getAppliedDistanceM());
  }

  public BigDecimal progressPercent(ChallengeMember member, Challenge challenge) {
    if (challenge.getGoalKm() == null || challenge.getGoalKm().signum() <= 0) {
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
  /**
   * 레이스 결과 순위: 완주자 우선(완주 시각 빠른 순) → 미완주는 누적 km 내림차순.
   * 종료 시 final_rank 부여와 화면 표시 순서의 단일 기준.
   */
  public static final Comparator<ChallengeMember> RACE_RESULT_ORDER =
      (m1, m2) -> {
        boolean f1 = m1.getFinishedAt() != null;
        boolean f2 = m2.getFinishedAt() != null;
        if (f1 && f2) return m1.getFinishedAt().compareTo(m2.getFinishedAt());
        if (f1) return -1;
        if (f2) return 1;
        return m2.getTotalKm().compareTo(m1.getTotalKm());
      };

  /**
   * 종료 시 확정 순위(final_rank)를 1부터 부여하고 저장한다({@link #RACE_RESULT_ORDER} 기준).
   * 호출 측의 (읽기 전용이 아닌) 트랜잭션 안에서 실행되는 것을 전제로 한다.
   */
  public void assignFinalRanks(List<ChallengeMember> members) {
    List<ChallengeMember> ordered = members.stream().sorted(RACE_RESULT_ORDER).toList();
    int rank = 1;
    for (ChallengeMember m : ordered) {
      m.assignFinalRank(rank++);
      challengeMemberRepository.save(m);
    }
  }

  /** 확정 순위를 초기화한다(레이스 되돌림 — 운동 삭제로 종료가 풀릴 때). */
  public void clearFinalRanks(Long challengeId) {
    List<ChallengeMember> members = challengeMemberRepository.findAllForChallenge(challengeId);
    for (ChallengeMember m : members) {
      m.clearFinalRank();
      challengeMemberRepository.save(m);
    }
  }

  /** 누적 거리 내림차순, 동률이면 먼저 완주한 멤버 우선(미완주는 후순위). */
  private static final Comparator<ChallengeMember> BY_DISTANCE_THEN_FINISH =
      Comparator.comparing(ChallengeMember::getTotalKm)
          .thenComparing(
              m -> m.getFinishedAt() == null ? OffsetDateTime.MAX : m.getFinishedAt(),
              Comparator.reverseOrder());

  private AppUser resolveWinnerForDisplay(Challenge challenge, List<ChallengeMember> members) {
    // 참여자가 1명뿐(방장 혼자)인 레이스는 대결이 성립하지 않으므로 우승자 없음.
    if (members.size() <= 1) {
      return null;
    }
    if (challenge.getWinner() != null) {
      return challenge.getWinner();
    }

    AppUser firstFinisher = firstFinisher(members);
    if (firstFinisher != null) {
      return firstFinisher;
    }

    // 완주자 없이 기간이 종료됐으면 누적 거리 최상위 멤버.
    OffsetDateTime now = OffsetDateTime.now();
    boolean timeEnded = challenge.getEndAt() != null && now.isAfter(challenge.getEndAt());
    return timeEnded ? topByDistance(members) : null;
  }

  /** 가장 먼저 완주한 멤버의 사용자, 완주자가 없으면 null. */
  private static AppUser firstFinisher(List<ChallengeMember> members) {
    return members.stream()
        .filter(m -> m.getFinishedAt() != null)
        .min(Comparator.comparing(ChallengeMember::getFinishedAt))
        .map(ChallengeMember::getUser)
        .orElse(null);
  }

  /**
   * 누적 거리(동률 시 완주 시각) 최상위 멤버의 사용자.
   * 모든 참여자의 거리가 0이면 대결이 성립하지 않으므로 null 반환.
   */
  private static AppUser topByDistance(List<ChallengeMember> members) {
    boolean anyRan = members.stream().anyMatch(m -> m.getTotalKm().compareTo(BigDecimal.ZERO) > 0);
    if (!anyRan) return null;
    return members.stream()
        .max(BY_DISTANCE_THEN_FINISH)
        .map(ChallengeMember::getUser)
        .orElse(null);
  }

  private Challenge requireChallenge(Long id) {
    return challengeRepository
        .findByIdWithDetails(id)
        .orElseThrow(() -> ApiException.notFound("challenge_not_found"));
  }

  private ChallengeMember newMember(Challenge challenge, AppUser user) {
    return ChallengeMember.builder()
        .challenge(challenge)
        .user(user)
        .totalKm(BigDecimal.ZERO)
        .build();
  }

  private static final int TITLE_MAX_BYTES = 50;
  private static final int MAX_GOAL_KM = 1000;
  private static final int MAX_MEMBERS_LIMIT = 50;
  private void validateRoomInput(
      String title,
      BigDecimal goalKm,
      int maxMembers,
      OffsetDateTime startAt,
      OffsetDateTime endAt) {
    TextValidation.requireCleanText(title, TITLE_MAX_BYTES, true, "title");
    if (goalKm == null
        || goalKm.signum() <= 0
        || goalKm.compareTo(BigDecimal.valueOf(MAX_GOAL_KM)) > 0) {
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

  private void ensureOwner(AuthPrincipal principal, Challenge challenge) {
    if (!challenge.isOwner(principal.userId())) {
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
      int memberCount,
      Set<UUID> rivalUserIds) {}
}
