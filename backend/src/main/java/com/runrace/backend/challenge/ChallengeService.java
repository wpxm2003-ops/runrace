package com.runrace.backend.challenge;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.user.AppUser;
import com.runrace.backend.user.AppUserRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ChallengeService {
  private static final int MAX_ACTIVE_ROOMS_PER_CREATOR = 3;

  private final AppUserRepository appUserRepository;
  private final ChallengeRepository challengeRepository;
  private final ChallengeMemberRepository challengeMemberRepository;

  @Transactional
  public Challenge createRoom(
      AuthPrincipal principal,
      String title,
      int goalKm,
      int maxMembers,
      LocalDate startDate,
      LocalDate endDate
  ) {
    validateRoomInput(title, goalKm, maxMembers, startDate, endDate);

    OffsetDateTime now = OffsetDateTime.now();
    AppUser creator = appUserRepository.findById(principal.userId()).orElseThrow();

    long activeCount = challengeRepository.countActiveByCreator(creator.getId(), now);
    if (activeCount >= MAX_ACTIVE_ROOMS_PER_CREATOR) {
      throw new IllegalStateException("active_room_limit");
    }

    Challenge c = new Challenge();
    c.setCreator(creator);
    c.setTitle(title.trim());
    c.setGoalKm(goalKm);
    c.setMaxMembers(maxMembers);
    c.setStartAt(startDate.atStartOfDay().atOffset(ZoneOffset.UTC));
    c.setEndAt(endDate.atTime(23, 59, 59).atOffset(ZoneOffset.UTC));
    c.setCreatedAt(now);
    Challenge saved = challengeRepository.save(c);

    ChallengeMember cm = new ChallengeMember();
    cm.setChallenge(saved);
    cm.setUser(creator);
    cm.setTotalKm(BigDecimal.ZERO);
    challengeMemberRepository.save(cm);

    return saved;
  }

  @Transactional
  public Challenge updateRoom(
      AuthPrincipal principal,
      Long id,
      String title,
      int goalKm,
      int maxMembers,
      LocalDate startDate,
      LocalDate endDate
  ) {
    Challenge c = challengeRepository.findByIdWithDetails(id).orElseThrow();
    ensureOwner(principal, c);
    OffsetDateTime now = OffsetDateTime.now();
    if (!now.isBefore(c.getStartAt())) {
      throw new IllegalStateException("already_started");
    }

    validateRoomInput(title, goalKm, maxMembers, startDate, endDate);
    long memberCount = challengeMemberRepository.countByChallengeId(id);
    if (maxMembers < memberCount) {
      throw new IllegalArgumentException("max_members_too_small");
    }

    c.setTitle(title.trim());
    c.setGoalKm(goalKm);
    c.setMaxMembers(maxMembers);
    c.setStartAt(startDate.atStartOfDay().atOffset(ZoneOffset.UTC));
    c.setEndAt(endDate.atTime(23, 59, 59).atOffset(ZoneOffset.UTC));
    return challengeRepository.save(c);
  }

  @Transactional
  public void deleteRoom(AuthPrincipal principal, Long id) {
    Challenge c = challengeRepository.findByIdWithDetails(id).orElseThrow();
    ensureOwner(principal, c);
    OffsetDateTime now = OffsetDateTime.now();
    if (!now.isBefore(c.getStartAt())) {
      throw new IllegalStateException("already_started");
    }
    challengeRepository.delete(c);
  }

  @Transactional
  public void joinRoom(AuthPrincipal principal, Long id) {
    Challenge c = challengeRepository.findById(id).orElseThrow();
    OffsetDateTime now = OffsetDateTime.now();
    if (!now.isBefore(c.getStartAt())) {
      throw new IllegalStateException("already_started");
    }
    if (now.isAfter(c.getEndAt())) {
      throw new IllegalStateException("ended");
    }
    if (c.getWinner() != null) {
      throw new IllegalStateException("ended");
    }
    if (challengeMemberRepository.findByChallengeIdAndUserId(id, principal.userId()).isPresent()) {
      throw new IllegalStateException("already_member");
    }
    long memberCount = challengeMemberRepository.countByChallengeId(id);
    if (memberCount >= c.getMaxMembers()) {
      throw new IllegalStateException("room_full");
    }

    AppUser me = appUserRepository.findById(principal.userId()).orElseThrow();
    ChallengeMember cm = new ChallengeMember();
    cm.setChallenge(c);
    cm.setUser(me);
    cm.setTotalKm(BigDecimal.ZERO);
    challengeMemberRepository.save(cm);
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
    return challengeRepository.findAllForUser(principal.userId());
  }

  @Transactional(readOnly = true)
  public long countActiveRoomsForCreator(AuthPrincipal principal) {
    return challengeRepository.countActiveByCreator(
        principal.userId(), OffsetDateTime.now());
  }

  @Transactional
  public ChallengeDetailView getDetail(Optional<UUID> currentUserId, Long id) {
    Challenge c = challengeRepository.findByIdWithDetails(id).orElseThrow();
    List<ChallengeMember> members = challengeMemberRepository.findAllForChallenge(id);
    resolveWinnerIfNeeded(c, members);

    UUID userId = currentUserId.orElse(null);
    boolean isMember =
        userId != null
            && challengeMemberRepository.findByChallengeIdAndUserId(id, userId).isPresent();
    boolean isOwner = userId != null && c.getCreator().getId().equals(userId);
    OffsetDateTime now = OffsetDateTime.now();
    boolean hasStarted = !now.isBefore(c.getStartAt());
    boolean hasEnded = isEnded(c, now);

    return new ChallengeDetailView(
        c,
        members,
        userId,
        isMember,
        isOwner,
        hasStarted,
        hasEnded,
        c.getWinner(),
        members.size());
  }

  @Transactional(readOnly = true)
  public List<UUID> listMemberUserIds(Long challengeId) {
    return challengeMemberRepository.findAllForChallenge(challengeId).stream()
        .map(cm -> cm.getUser().getId())
        .toList();
  }

  public BigDecimal goalKmAsDecimal(Challenge c) {
    return BigDecimal.valueOf(c.getGoalKm());
  }

  public void onMemberProgress(ChallengeMember cm, BigDecimal nextTotalKm) {
    Challenge c = cm.getChallenge();
    BigDecimal goal = goalKmAsDecimal(c);
    if (nextTotalKm.compareTo(goal) >= 0 && cm.getFinishedAt() == null) {
      cm.setFinishedAt(OffsetDateTime.now());
      if (c.getWinner() == null) {
        c.setWinner(cm.getUser());
        challengeRepository.save(c);
      }
    }
  }

  @Transactional
  protected void resolveWinnerIfNeeded(Challenge c, List<ChallengeMember> members) {
    if (c.getWinner() != null) {
      return;
    }

    Optional<ChallengeMember> firstFinisher =
        members.stream()
            .filter(m -> m.getFinishedAt() != null)
            .min(Comparator.comparing(ChallengeMember::getFinishedAt));
    if (firstFinisher.isPresent()) {
      c.setWinner(firstFinisher.get().getUser());
      challengeRepository.save(c);
      return;
    }

    OffsetDateTime now = OffsetDateTime.now();
    if (c.getEndAt() != null && now.isAfter(c.getEndAt()) && !members.isEmpty()) {
      ChallengeMember top =
          members.stream()
              .max(
                  Comparator.comparing(ChallengeMember::getTotalKm)
                      .thenComparing(
                          m -> m.getFinishedAt() == null ? OffsetDateTime.MAX : m.getFinishedAt(),
                          Comparator.reverseOrder()))
              .orElseThrow();
      c.setWinner(top.getUser());
      challengeRepository.save(c);
    }
  }

  public BigDecimal progressPercent(ChallengeMember cm, Challenge c) {
    if (c.getGoalKm() == null || c.getGoalKm() <= 0) return BigDecimal.ZERO;
    return cm.getTotalKm()
        .multiply(BigDecimal.valueOf(100))
        .divide(goalKmAsDecimal(c), 1, RoundingMode.HALF_UP)
        .min(BigDecimal.valueOf(100));
  }

  public static boolean isEnded(Challenge c, OffsetDateTime now) {
    if (c.getWinner() != null) return true;
    return c.getEndAt() != null && now.isAfter(c.getEndAt());
  }

  private void validateRoomInput(
      String title, int goalKm, int maxMembers, LocalDate startDate, LocalDate endDate) {
    if (title == null || title.isBlank() || title.length() > 200) {
      throw new IllegalArgumentException("invalid_title");
    }
    if (goalKm < 1) throw new IllegalArgumentException("invalid_goal_km");
    if (maxMembers < 1 || maxMembers > 50) throw new IllegalArgumentException("invalid_max_members");
    if (startDate == null || endDate == null) throw new IllegalArgumentException("invalid_dates");
    if (startDate.isBefore(LocalDate.now())) {
      throw new IllegalArgumentException("invalid_start_date");
    }
    if (!endDate.isAfter(startDate)) throw new IllegalArgumentException("invalid_date_range");
  }

  private void ensureOwner(AuthPrincipal principal, Challenge c) {
    if (!c.getCreator().getId().equals(principal.userId())) {
      throw new IllegalStateException("forbidden");
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
