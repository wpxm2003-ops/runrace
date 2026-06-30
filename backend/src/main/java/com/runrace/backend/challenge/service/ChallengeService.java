package com.runrace.backend.challenge.service;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.domain.ChallengeMember;
import com.runrace.backend.challenge.domain.ChallengePrize;
import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.challenge.repository.ChallengePrizeRepository;
import com.runrace.backend.challenge.repository.ChallengeRepository;
import com.runrace.backend.challenge.repository.ChallengeWorkoutRepository;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.SupportedLanguages;
import com.runrace.backend.common.TextValidation;
import com.runrace.backend.challenge.dto.ChallengeWorkoutListItem;
import com.runrace.backend.challenge.dto.HeadToHeadRow;
import com.runrace.backend.event.ChallengeEndedNoParticipantsEvent;
import com.runrace.backend.event.ChallengeEvents;
import com.runrace.backend.rival.repository.RivalRepository;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
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
  public static final int MAX_ACTIVE_ROOMS_PER_CREATOR = 3;
  private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

  private final AppUserRepository appUserRepository;
  private final ChallengeRepository challengeRepository;
  private final ChallengeMemberRepository challengeMemberRepository;
  private final ChallengePrizeRepository challengePrizeRepository;
  private final ChallengeWorkoutRepository challengeWorkoutRepository;
  private final ApplicationEventPublisher eventPublisher;
  private final RivalRepository rivalRepository;
  private final RaceFinalizationService raceFinalization;

  @Transactional
  public Challenge createRoom(
      AuthPrincipal principal,
      String title,
      BigDecimal goalKm,
      int maxMembers,
      OffsetDateTime startAt,
      OffsetDateTime endAt,
      String langCd,
      String stake) {
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
        .stake(cleanStake(stake))
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
      OffsetDateTime endAt,
      String stake) {
    Challenge challenge = requireChallenge(id);
    ensureOwner(principal, challenge);
    ensureNotStarted(challenge);
    validateRoomInput(title, goalKm, maxMembers, startAt, endAt);

    if (maxMembers < challengeMemberRepository.countByChallengeId(id)) {
      throw ApiException.badRequest("max_members_too_small");
    }

    challenge.updateRoom(
        title.trim(), goalKm.setScale(3, RoundingMode.HALF_UP), maxMembers, startAt, endAt,
        cleanStake(stake));
    return challengeRepository.save(challenge);
  }

  /** 내기 텍스트 정리 — 선택값이라 비어있으면 null, 있으면 길이·금칙어 검증 후 트림본 반환. */
  private static final int STAKE_MAX_CHARS = 30;

  private String cleanStake(String raw) {
    if (raw == null || raw.isBlank()) return null;
    return TextValidation.requireCleanText(raw, STAKE_MAX_CHARS, false, "stake");
  }

  @Transactional
  public void deleteRoom(AuthPrincipal principal, Long id) {
    Challenge challenge = requireChallenge(id);
    ensureOwner(principal, challenge);
    ensureNotStarted(challenge);
    List<String> prizeKeys = collectPrizeImageKeys(id);
    challengeRepository.delete(challenge);
    publishPrizeCleanup(prizeKeys);
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
    List<String> prizeKeys = collectPrizeImageKeys(challengeId);
    challengeRepository.delete(challenge);
    publishPrizeCleanup(prizeKeys);
    eventPublisher.publishEvent(new ChallengeEndedNoParticipantsEvent(challengeId, creatorId));
    return true;
  }

  /**
   * 스케줄러용 — 레이스 1건의 생명주기 전환(혼자 삭제 / 기간 만료 확정)을 독립 트랜잭션으로 처리한다.
   * 레이스별로 분리해 한 건이 실패해도 배치 전체가 롤백되지 않게 한다.
   * 종료 확정·순위·우승자 결정은 {@link RaceFinalizationService}가 담당한다.
   */
  @Transactional
  public void processRaceLifecycle(Long challengeId, OffsetDateTime now) {
    Challenge challenge = challengeRepository.findById(challengeId).orElse(null);
    if (challenge == null) return; // 그사이 삭제됐으면 건너뜀
    if (deleteIfSolo(challenge, now)) return;
    raceFinalization.finalizeIfTimeEnded(challenge, now);
  }

  @Transactional(readOnly = true)
  public ChallengeDetailView getDetail(Optional<UUID> currentUserId, Long id) {
    Challenge challenge = requireChallenge(id);
    List<ChallengeMember> members = challengeMemberRepository.findAllForChallenge(id);
    OffsetDateTime now = OffsetDateTime.now();
    AppUser winner = RaceFinalizationService.resolveWinner(challenge, members, now);

    UUID userId = currentUserId.orElse(null);
    boolean isMember =
        userId != null
            && challengeMemberRepository.findByChallengeIdAndUserId(id, userId).isPresent();
    boolean isOwner = challenge.isOwner(userId);

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
        challengeMemberRepository.findParticipantIdsIn(challengeId, new ArrayList<>(rivalIds));
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

  /**
   * 레이스 반영 운동 목록 — 전체 공개(비참여자·비로그인도 조회 가능).
   * 스칼라 projection이라 GPS 경로(path_json)를 로딩하지 않는다.
   */
  @Transactional(readOnly = true)
  public List<ChallengeWorkoutListItem> listWorkouts(Long challengeId) {
    requireChallenge(challengeId); // 존재 검증(없으면 404)
    return challengeWorkoutRepository.findApprovedWorkoutListItems(challengeId);
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
  private static final int MAX_RACE_DURATION_DAYS = 31;
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
    if (endAt.isAfter(startAt.plusDays(MAX_RACE_DURATION_DAYS))) {
      throw ApiException.badRequest("race_duration_too_long");
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

  private List<String> collectPrizeImageKeys(Long challengeId) {
    return challengePrizeRepository.findByChallengeIdOrderByRank(challengeId).stream()
        .map(ChallengePrize::getImageKey)
        .filter(Objects::nonNull)
        .toList();
  }

  private void publishPrizeCleanup(List<String> keys) {
    if (!keys.isEmpty()) {
      eventPublisher.publishEvent(new ChallengeEvents.PrizeImagesOrphanedEvent(keys));
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
