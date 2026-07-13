package com.runrace.backend.crew.service;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.IsoTime;
import com.runrace.backend.crew.domain.Crew;
import com.runrace.backend.crew.domain.CrewMatch;
import com.runrace.backend.crew.domain.CrewMatchRoster;
import com.runrace.backend.crew.domain.CrewMember;
import com.runrace.backend.crew.dto.CrewMatchDetailResponse;
import com.runrace.backend.crew.dto.CrewMatchDetailResponse.RosterRow;
import com.runrace.backend.crew.dto.CrewMatchSummary;
import com.runrace.backend.crew.dto.MyCrewMatchesResponse;
import com.runrace.backend.crew.dto.MyCrewMatchesResponse.MatchRecord;
import com.runrace.backend.crew.repository.CrewMatchRepository;
import com.runrace.backend.crew.repository.CrewMatchRosterRepository;
import com.runrace.backend.crew.repository.CrewMemberRepository;
import com.runrace.backend.crew.repository.CrewRepository;
import com.runrace.backend.event.CrewMatchEvents;
import com.runrace.backend.workout.domain.WorkoutType;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 크루 대항전(C1) — 도전장 발송/수락/거절, 로스터 지명(양측 동수), 총거리전 채점.
 * 점수는 로스터 멤버들의 [startAt, endAt) GPS 러닝 합산으로 파생하고(집계 테이블 0,
 * 실내런은 소급 입력 조작 방지를 위해 제외), 종료 확정은 조회 시점에 lazy로 수행한다.
 */
@Service
@RequiredArgsConstructor
public class CrewMatchService {

  static final int ROSTER_MIN = 3;
  static final int ROSTER_MAX = 10;
  static final int DURATION_MIN_DAYS = 3;
  static final int DURATION_MAX_DAYS = 14;
  /** 도전장 유효 기간 — 지나면 만료 취급(상태 저장 없이 파생). */
  static final int PENDING_TTL_DAYS = 7;

  private static final ZoneId KST = ZoneId.of("Asia/Seoul");

  private final CrewRepository crewRepository;
  private final CrewMemberRepository crewMemberRepository;
  private final CrewMatchRepository crewMatchRepository;
  private final CrewMatchRosterRepository crewMatchRosterRepository;
  private final WorkoutSessionRepository workoutSessionRepository;
  private final ApplicationEventPublisher eventPublisher;

  // ── 도전장 생성/수락/거절/취소 ────────────────────────────────

  /** 도전장 발송(리더 전용) — 상대 크루를 이름으로 지목하고 내 로스터를 함께 지명한다. */
  @Transactional
  public void create(UUID meId, String opponentCrewName, int rosterSize, int durationDays,
      List<UUID> rosterUserIds) {
    Crew myCrew = requireMyCrewAsLeader(meId);

    if (rosterSize < ROSTER_MIN || rosterSize > ROSTER_MAX) {
      throw ApiException.badRequest("invalid_roster_size");
    }
    if (durationDays < DURATION_MIN_DAYS || durationDays > DURATION_MAX_DAYS) {
      throw ApiException.badRequest("invalid_duration");
    }

    String name = opponentCrewName == null ? "" : opponentCrewName.trim();
    Crew opponent = crewRepository.findByName(name)
        .orElseThrow(() -> ApiException.notFound("crew_not_found"));
    if (opponent.getId().equals(myCrew.getId())) {
      throw ApiException.badRequest("cannot_challenge_self");
    }
    if (crewMemberRepository.countByCrewId(opponent.getId()) < rosterSize) {
      throw ApiException.conflict("opponent_too_small");
    }

    OffsetDateTime now = OffsetDateTime.now();
    if (!crewMatchRepository.findActiveByCrewId(myCrew.getId(), pendingSince(now)).isEmpty()) {
      throw ApiException.conflict("match_already_active");
    }
    if (!crewMatchRepository.findActiveByCrewId(opponent.getId(), pendingSince(now)).isEmpty()) {
      throw ApiException.conflict("opponent_busy");
    }

    List<CrewMember> myRoster = validateRoster(myCrew.getId(), rosterUserIds, rosterSize);

    CrewMatch match = crewMatchRepository.save(CrewMatch.builder()
        .challengerCrew(myCrew)
        .opponentCrew(opponent)
        .rosterSize(rosterSize)
        .durationDays(durationDays)
        .createdAt(now)
        .build());
    saveRoster(match, myCrew.getId(), myRoster);

    // 커밋 후 상대 크루 리더에게 도전장 도착 푸시 — 방치로 인한 슬롯 잠금 완화.
    eventPublisher.publishEvent(new CrewMatchEvents.ChallengeReceived(
        opponent.getLeader().getId(), myCrew.getName(), match.getId()));
  }

  /** 도전장 수락(상대 크루 리더 전용) — 수락 크루 로스터 지명 + 다음날 0시 KST 동시 출발 확정. */
  @Transactional
  public void accept(UUID meId, long matchId, List<UUID> rosterUserIds) {
    Crew myCrew = requireMyCrewAsLeader(meId);
    CrewMatch match = requireMatch(matchId);
    OffsetDateTime now = OffsetDateTime.now();

    if (!match.getOpponentCrew().getId().equals(myCrew.getId())) {
      throw ApiException.forbidden("not_opponent_leader");
    }
    requireAlivePending(match, now);

    // 그 사이 도전 크루가 다른 대결을 잡았을 수 있다 — 이 매치를 제외하고 활성 검사.
    boolean challengerBusy = crewMatchRepository
        .findActiveByCrewId(match.getChallengerCrew().getId(), pendingSince(now)).stream()
        .anyMatch(m -> !m.getId().equals(match.getId()) && m.getStatus() == CrewMatch.Status.ACCEPTED);
    if (challengerBusy) {
      throw ApiException.conflict("opponent_busy");
    }

    List<CrewMember> roster = validateRoster(myCrew.getId(), rosterUserIds, match.getRosterSize());

    OffsetDateTime startAt = LocalDate.now(KST).plusDays(1).atStartOfDay(KST).toOffsetDateTime();
    match.accept(startAt, startAt.plusDays(match.getDurationDays()));
    crewMatchRepository.save(match);
    saveRoster(match, myCrew.getId(), roster);

    // 커밋 후 양측 로스터 전원에게 출전 확정 푸시(수락 처리한 리더 본인 제외).
    String challengerName = match.getChallengerCrew().getName();
    String opponentName = myCrew.getName();
    List<CrewMatchEvents.MatchConfirmed.RosterPush> receivers = new ArrayList<>();
    for (CrewMatchRoster r : crewMatchRosterRepository.findAllByMatchId(match.getId())) {
      UUID userId = r.getUser().getId();
      if (userId.equals(meId)) {
        continue;
      }
      boolean isChallengerSide = r.getCrewId().equals(match.getChallengerCrew().getId());
      receivers.add(new CrewMatchEvents.MatchConfirmed.RosterPush(
          userId, isChallengerSide ? opponentName : challengerName));
    }
    if (!receivers.isEmpty()) {
      eventPublisher.publishEvent(new CrewMatchEvents.MatchConfirmed(receivers, match.getId()));
    }
  }

  /** 도전장 거절(상대 크루 리더 전용). */
  @Transactional
  public void decline(UUID meId, long matchId) {
    Crew myCrew = requireMyCrewAsLeader(meId);
    CrewMatch match = requireMatch(matchId);
    if (!match.getOpponentCrew().getId().equals(myCrew.getId())) {
      throw ApiException.forbidden("not_opponent_leader");
    }
    requireAlivePending(match, OffsetDateTime.now());
    match.decline();
    crewMatchRepository.save(match);
  }

  /** 도전장 취소(도전 크루 리더 전용, 수락 전만) — 행 자체를 삭제한다. */
  @Transactional
  public void cancel(UUID meId, long matchId) {
    Crew myCrew = requireMyCrewAsLeader(meId);
    CrewMatch match = requireMatch(matchId);
    if (!match.getChallengerCrew().getId().equals(myCrew.getId())) {
      throw ApiException.forbidden("not_challenger_leader");
    }
    if (match.getStatus() != CrewMatch.Status.PENDING) {
      throw ApiException.conflict("match_not_pending");
    }
    crewMatchRepository.delete(match);
  }

  // ── 조회 ──────────────────────────────────────────────────────

  /** 크루 홈 대항전 섹션 — 전적 + 진행중 + 받은/보낸 도전장 + 최근 결과. */
  @Transactional
  public MyCrewMatchesResponse myMatches(UUID meId) {
    Crew myCrew = requireMembership(meId).getCrew();
    Long crewId = myCrew.getId();
    OffsetDateTime now = OffsetDateTime.now();

    CrewMatchSummary current = null;
    List<CrewMatchSummary> received = new ArrayList<>();
    List<CrewMatchSummary> sent = new ArrayList<>();
    for (CrewMatch m : crewMatchRepository.findActiveByCrewId(crewId, pendingSince(now))) {
      // 기간이 끝난 ACCEPTED는 여기서 lazy 확정 → lastEnded로 흘러가게 한다.
      if (m.getStatus() == CrewMatch.Status.ACCEPTED && !m.isEnded()
          && !now.isBefore(m.getEndAt())) {
        finalizeEnded(m);
        continue;
      }
      CrewMatchSummary summary = toSummary(m, crewId, now);
      if (m.getStatus() == CrewMatch.Status.ACCEPTED) {
        current = summary;
      } else if (m.getOpponentCrew().getId().equals(crewId)) {
        received.add(summary);
      } else {
        sent.add(summary);
      }
    }

    CrewMatchSummary lastEnded = crewMatchRepository
        .findEndedByCrewId(crewId, PageRequest.of(0, 1)).stream()
        .findFirst()
        .map(m -> toSummary(m, crewId, now))
        .orElse(null);

    MatchRecord record = new MatchRecord(
        crewMatchRepository.countWins(crewId),
        crewMatchRepository.countLosses(crewId),
        crewMatchRepository.countDraws(crewId));
    return new MyCrewMatchesResponse(record, current, received, sent, lastEnded);
  }

  /** 대항전 상세 — 참가 크루 멤버만. 기간이 끝났으면 이 시점에 승자를 확정한다. */
  @Transactional
  public CrewMatchDetailResponse detail(UUID meId, long matchId) {
    CrewMember membership = requireMembership(meId);
    Long myCrewId = membership.getCrew().getId();
    CrewMatch match = requireMatch(matchId);
    if (!match.involves(myCrewId)) {
      throw ApiException.forbidden("not_participant");
    }

    OffsetDateTime now = OffsetDateTime.now();
    if (match.getStatus() == CrewMatch.Status.ACCEPTED && !match.isEnded()
        && !now.isBefore(match.getEndAt())) {
      finalizeEnded(match);
    }

    List<CrewMatchRoster> rosters = crewMatchRosterRepository.findAllByMatchId(matchId);
    Map<UUID, Long> byUser = memberDistances(match, rosters, now);

    Long challengerId = match.getChallengerCrew().getId();
    List<RosterRow> challengerRows = new ArrayList<>();
    List<RosterRow> opponentRows = new ArrayList<>();
    long challengerSum = 0;
    long opponentSum = 0;
    for (CrewMatchRoster r : rosters) {
      long dist = byUser.getOrDefault(r.getUser().getId(), 0L);
      RosterRow row = new RosterRow(
          r.getUser().getId(), r.getUser().getNickname(),
          r.getUser().getId().equals(meId), dist);
      if (r.getCrewId().equals(challengerId)) {
        challengerRows.add(row);
        challengerSum += dist;
      } else {
        opponentRows.add(row);
        opponentSum += dist;
      }
    }
    Comparator<RosterRow> byDistance = Comparator.comparingLong(RosterRow::distanceM).reversed();
    challengerRows.sort(byDistance);
    opponentRows.sort(byDistance);

    boolean myCrewIsChallenger = challengerId.equals(myCrewId);
    boolean isLeader = membership.getCrew().isLeader(meId);
    boolean alivePending = match.getStatus() == CrewMatch.Status.PENDING && !expired(match, now);
    return new CrewMatchDetailResponse(
        match.getId(),
        derivedStatus(match, now),
        match.getChallengerCrew().getName(),
        match.getOpponentCrew().getName(),
        myCrewIsChallenger,
        match.getRosterSize(),
        match.getDurationDays(),
        IsoTime.format(match.getCreatedAt()),
        IsoTime.formatOrNull(match.getStartAt()),
        IsoTime.formatOrNull(match.getEndAt()),
        alivePending && !myCrewIsChallenger && isLeader,
        alivePending && !myCrewIsChallenger && isLeader,
        alivePending && myCrewIsChallenger && isLeader,
        challengerSum,
        opponentSum,
        result(match, myCrewId),
        challengerRows,
        opponentRows);
  }

  // ── 내부 헬퍼 ─────────────────────────────────────────────────

  /** 기간 종료된 ACCEPTED 매치의 승자를 확정한다. */
  private void finalizeEnded(CrewMatch match) {
    List<CrewMatchRoster> rosters = crewMatchRosterRepository.findAllByMatchId(match.getId());
    Map<UUID, Long> byUser = memberDistances(match, rosters, match.getEndAt());
    long challengerSum = 0;
    long opponentSum = 0;
    Long challengerId = match.getChallengerCrew().getId();
    for (CrewMatchRoster r : rosters) {
      long dist = byUser.getOrDefault(r.getUser().getId(), 0L);
      if (r.getCrewId().equals(challengerId)) {
        challengerSum += dist;
      } else {
        opponentSum += dist;
      }
    }
    Long winner = challengerSum > opponentSum
        ? challengerId
        : (opponentSum > challengerSum ? match.getOpponentCrew().getId() : null);
    match.finish(winner);
    crewMatchRepository.save(match);
  }

  /** 로스터 전원의 [startAt, min(now, endAt)) 구간 GPS 거리. 시작 전·PENDING이면 빈 맵. */
  private Map<UUID, Long> memberDistances(
      CrewMatch match, List<CrewMatchRoster> rosters, OffsetDateTime now) {
    Map<UUID, Long> byUser = new HashMap<>();
    if (match.getStartAt() == null || rosters.isEmpty() || now.isBefore(match.getStartAt())) {
      return byUser;
    }
    OffsetDateTime to = now.isBefore(match.getEndAt()) ? now : match.getEndAt();
    List<UUID> userIds = rosters.stream().map(r -> r.getUser().getId()).toList();
    // GPS만 인정 — 실내런은 과거 시각 수동 입력이 가능해 대항전 조작 벡터가 된다.
    for (var row : workoutSessionRepository.aggregateDistanceBetweenByType(
        userIds, match.getStartAt(), to, WorkoutType.GPS)) {
      byUser.put(row.getUserId(), row.getDistanceM());
    }
    return byUser;
  }

  private CrewMatchSummary toSummary(CrewMatch match, Long myCrewId, OffsetDateTime now) {
    long myDist = 0;
    long opDist = 0;
    if (match.getStartAt() != null) {
      List<CrewMatchRoster> rosters = crewMatchRosterRepository.findAllByMatchId(match.getId());
      Map<UUID, Long> byUser = memberDistances(match, rosters, now);
      for (CrewMatchRoster r : rosters) {
        long dist = byUser.getOrDefault(r.getUser().getId(), 0L);
        if (r.getCrewId().equals(myCrewId)) {
          myDist += dist;
        } else {
          opDist += dist;
        }
      }
    }
    return new CrewMatchSummary(
        match.getId(),
        derivedStatus(match, now),
        match.getChallengerCrew().getName(),
        match.getOpponentCrew().getName(),
        match.getChallengerCrew().getId().equals(myCrewId),
        match.getRosterSize(),
        match.getDurationDays(),
        IsoTime.formatOrNull(match.getStartAt()),
        IsoTime.formatOrNull(match.getEndAt()),
        myDist,
        opDist,
        result(match, myCrewId));
  }

  /** 저장 상태 + 시간으로 파생한 표시 상태. */
  private String derivedStatus(CrewMatch match, OffsetDateTime now) {
    return switch (match.getStatus()) {
      case DECLINED -> "DECLINED";
      case PENDING -> expired(match, now) ? "EXPIRED" : "PENDING";
      case ACCEPTED -> match.isEnded() || !now.isBefore(match.getEndAt())
          ? "ENDED"
          : (now.isBefore(match.getStartAt()) ? "SCHEDULED" : "IN_PROGRESS");
    };
  }

  /** 내 크루 관점 결과 — 종료 확정 전이면 null. */
  private String result(CrewMatch match, Long myCrewId) {
    if (!match.isEnded()) {
      return null;
    }
    if (match.getWinnerCrewId() == null) {
      return "DRAW";
    }
    return match.getWinnerCrewId().equals(myCrewId) ? "WIN" : "LOSS";
  }

  private static boolean expired(CrewMatch match, OffsetDateTime now) {
    return match.getCreatedAt().plusDays(PENDING_TTL_DAYS).isBefore(now);
  }

  private static OffsetDateTime pendingSince(OffsetDateTime now) {
    return now.minusDays(PENDING_TTL_DAYS);
  }

  private void requireAlivePending(CrewMatch match, OffsetDateTime now) {
    if (match.getStatus() != CrewMatch.Status.PENDING) {
      throw ApiException.conflict("match_not_pending");
    }
    if (expired(match, now)) {
      throw ApiException.conflict("match_expired");
    }
  }

  /** 로스터 검증 — 정확히 rosterSize명, 중복 없음, 전원 해당 크루 멤버. 크루 멤버 엔티티를 돌려준다. */
  private List<CrewMember> validateRoster(Long crewId, List<UUID> rosterUserIds, int rosterSize) {
    if (rosterUserIds == null) {
      throw ApiException.badRequest("invalid_roster");
    }
    Set<UUID> unique = new HashSet<>(rosterUserIds);
    if (unique.size() != rosterSize || rosterUserIds.size() != rosterSize) {
      throw ApiException.badRequest("invalid_roster");
    }
    List<CrewMember> members = crewMemberRepository.findAllByCrewIdOrderByJoinedAtAsc(crewId);
    Map<UUID, CrewMember> byUserId = new HashMap<>();
    for (CrewMember m : members) {
      byUserId.put(m.getUser().getId(), m);
    }
    List<CrewMember> roster = new ArrayList<>();
    for (UUID userId : unique) {
      CrewMember m = byUserId.get(userId);
      if (m == null) {
        throw ApiException.badRequest("roster_not_member");
      }
      roster.add(m);
    }
    return roster;
  }

  private void saveRoster(CrewMatch match, Long crewId, List<CrewMember> roster) {
    for (CrewMember m : roster) {
      crewMatchRosterRepository.save(CrewMatchRoster.builder()
          .match(match)
          .crewId(crewId)
          .user(m.getUser())
          .build());
    }
  }

  private CrewMember requireMembership(UUID meId) {
    return crewMemberRepository.findByUserId(meId)
        .orElseThrow(() -> ApiException.notFound("not_in_crew"));
  }

  /** 내 크루를 리더 자격으로 가져온다(도전장 발송·수락·거절·취소 공통 게이트). */
  private Crew requireMyCrewAsLeader(UUID meId) {
    CrewMember membership = requireMembership(meId);
    if (!membership.getCrew().isLeader(meId)) {
      throw ApiException.forbidden("not_leader");
    }
    return membership.getCrew();
  }

  private CrewMatch requireMatch(long matchId) {
    return crewMatchRepository.findByIdWithCrews(matchId)
        .orElseThrow(() -> ApiException.notFound("match_not_found"));
  }
}
