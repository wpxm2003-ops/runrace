package com.runrace.backend.challenge.service;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.domain.Challenge;
import com.runrace.backend.challenge.domain.ChallengeMember;
import com.runrace.backend.challenge.dto.ChallengeWorkoutListItem;
import com.runrace.backend.challenge.dto.HeadToHeadRow;
import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.challenge.repository.ChallengePrizeRepository;
import com.runrace.backend.challenge.repository.ChallengeRepository;
import com.runrace.backend.challenge.repository.ChallengeWorkoutRepository;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.SupportedLanguages;
import com.runrace.backend.crew.domain.Crew;
import com.runrace.backend.crew.repository.CrewMemberRepository;
import com.runrace.backend.crew.repository.CrewRepository;
import com.runrace.backend.rival.repository.RivalRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Slice;
import org.springframework.data.domain.SliceImpl;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 레이스 목록·상세·통계 조회를 변경 명령과 분리한다. */
@Service
@RequiredArgsConstructor
public class ChallengeQueryService {
  private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

  private final ChallengeRepository challengeRepository;
  private final ChallengeMemberRepository challengeMemberRepository;
  private final ChallengePrizeRepository challengePrizeRepository;
  private final ChallengeWorkoutRepository challengeWorkoutRepository;
  private final RivalRepository rivalRepository;
  private final CrewMemberRepository crewMemberRepository;
  private final CrewRepository crewRepository;

  @Transactional(readOnly = true)
  public Slice<Challenge> listCrewRacesPage(UUID userId, String phase, int page, int size) {
    PageRequest pageable = PageRequest.of(page, size);
    return crewMemberRepository.findByUserId(userId)
        .map(m -> challengeRepository.findCrewPage(
            m.getCrew().getId(), normalizePhase(phase), OffsetDateTime.now(), pageable))
        .orElseGet(() -> new SliceImpl<>(List.of(), pageable, false));
  }

  @Transactional(readOnly = true)
  public Slice<Challenge> listPublicPage(String lang, String phase, int page, int size) {
    String langFilter = SupportedLanguages.isSupported(lang) ? lang : null;
    return challengeRepository.findPublicPage(
        langFilter, normalizePhase(phase), OffsetDateTime.now(), PageRequest.of(page, size));
  }

  @Transactional(readOnly = true)
  public Set<Long> memberChallengeIds(UUID userId, List<Long> challengeIds) {
    if (challengeIds.isEmpty()) return Set.of();
    return Set.copyOf(challengeMemberRepository.findMemberChallengeIds(userId, challengeIds));
  }

  @Transactional(readOnly = true)
  public Slice<Challenge> listMinePage(UUID userId, String phase, int page, int size) {
    return challengeRepository.findMinePage(
        userId, normalizePhase(phase), OffsetDateTime.now(), PageRequest.of(page, size));
  }

  @Transactional(readOnly = true)
  public long countActiveRoomsForCreator(AuthPrincipal principal) {
    return challengeRepository.countActiveByCreator(principal.userId(), OffsetDateTime.now());
  }

  @Transactional(readOnly = true)
  public ChallengeService.ChallengeDetailView getDetail(Optional<UUID> currentUserId, Long id) {
    Challenge challenge = requireChallenge(id);
    List<ChallengeMember> members = challengeMemberRepository.findAllForChallenge(id);
    OffsetDateTime now = OffsetDateTime.now();
    UUID userId = currentUserId.orElse(null);
    boolean isMember = userId != null
        && members.stream().anyMatch(m -> m.getUser().getId().equals(userId));
    boolean isOwner = challenge.isOwner(userId);
    Set<UUID> rivalUserIds =
        userId == null ? Set.of() : new HashSet<>(rivalRepository.findRivalUserIds(userId));
    String crewName = challenge.getCrewId() == null
        ? null
        : crewRepository.findById(challenge.getCrewId()).map(Crew::getName).orElse(null);
    boolean crewInsider = challenge.getCrewId() == null
        || (userId != null
            && crewMemberRepository.findByCrewIdAndUserId(challenge.getCrewId(), userId).isPresent());

    return new ChallengeService.ChallengeDetailView(
        challenge, members, userId, isMember, isOwner,
        ChallengeService.hasStarted(challenge, now), ChallengeService.isEnded(challenge, now),
        members.size(), rivalUserIds, crewName, crewInsider);
  }

  @Transactional(readOnly = true)
  public List<HeadToHeadRow> headToHead(UUID meId, Long challengeId) {
    Set<UUID> rivalIds = new HashSet<>(rivalRepository.findRivalUserIds(meId));
    if (rivalIds.isEmpty()) return List.of();
    List<UUID> rivalParticipants =
        challengeMemberRepository.findParticipantIdsIn(challengeId, new ArrayList<>(rivalIds));
    if (rivalParticipants.isEmpty()) return List.of();
    Map<UUID, int[]> agg = challengeMemberRepository.headToHeadRecord(meId, rivalParticipants);
    return rivalParticipants.stream()
        .map(uid -> {
          int[] wl = agg.getOrDefault(uid, new int[] {0, 0});
          return new HeadToHeadRow(uid, wl[0], wl[1]);
        })
        .toList();
  }

  @Transactional(readOnly = true)
  public Map<Long, Long> batchMemberCounts(List<Long> challengeIds) {
    return challengeIds.isEmpty()
        ? Map.of()
        : challengeMemberRepository.memberCountsByChallengeId(challengeIds);
  }

  @Transactional(readOnly = true)
  public Set<Long> prizeChallengeIds(List<Long> challengeIds) {
    return challengeIds.isEmpty()
        ? Set.of()
        : Set.copyOf(challengePrizeRepository.findChallengeIdsWithPrize(challengeIds));
  }

  @Transactional(readOnly = true)
  public List<ChallengeWorkoutListItem> listWorkouts(Long challengeId) {
    requireChallenge(challengeId);
    return challengeWorkoutRepository.findApprovedWorkoutListItems(challengeId);
  }

  public BigDecimal progressPercent(BigDecimal km, Challenge challenge) {
    if (challenge.getGoalKm() == null || challenge.getGoalKm().signum() <= 0) {
      return BigDecimal.ZERO;
    }
    return km.multiply(HUNDRED)
        .divide(challenge.getGoalKm(), 1, RoundingMode.HALF_UP)
        .min(HUNDRED);
  }

  private Challenge requireChallenge(Long id) {
    return challengeRepository.findByIdWithDetails(id)
        .orElseThrow(() -> ApiException.notFound("challenge_not_found"));
  }

  private static String normalizePhase(String phase) {
    return ("active".equals(phase) || "scheduled".equals(phase)
            || "in_progress".equals(phase) || "ended".equals(phase))
        ? phase
        : "all";
  }
}
