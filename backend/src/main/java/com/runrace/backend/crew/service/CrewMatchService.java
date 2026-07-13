package com.runrace.backend.crew.service;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.IsoTime;
import com.runrace.backend.common.RaceRules;
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
import java.time.OffsetDateTime;
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
 * 실내런은 소급 입력 조작 방지를 위해 제외), 종료 확정은 조회 시점 lazy(myMatches/detail) +
 * {@link CrewMatchScheduler} 주기 배치 양쪽에서 수행해, 아무도 앱을 안 열어도 결과 푸시가 나가게 한다.
 */
@Service
@RequiredArgsConstructor
public class CrewMatchService {

  static final int ROSTER_MIN = 2;
  static final int ROSTER_MAX = 50;

  private final CrewRepository crewRepository;
  private final CrewMemberRepository crewMemberRepository;
  private final CrewMatchRepository crewMatchRepository;
  private final CrewMatchRosterRepository crewMatchRosterRepository;
  private final WorkoutSessionRepository workoutSessionRepository;
  private final ApplicationEventPublisher eventPublisher;

  // ── 도전장 생성/수락/거절/취소 ────────────────────────────────

  /**
   * 도전장 발송(리더 전용) — 상대 크루를 이름으로 지목하고 내 로스터를 함께 지명한다.
   * 대결 기간(startAt/endAt)은 레이스 등록과 동일한 규칙으로 도전자가 직접 설정한다.
   * 목표 없이 항상 기간 내 무제한 — 로스터 합산 거리로 승부한다.
   */
  @Transactional
  public void create(UUID meId, String opponentCrewName, int rosterSize,
      OffsetDateTime startAt, OffsetDateTime endAt, List<UUID> rosterUserIds) {
    Crew myCrew = requireMyCrewAsLeader(meId);

    if (rosterSize < ROSTER_MIN || rosterSize > ROSTER_MAX) {
      throw ApiException.badRequest("invalid_roster_size");
    }
    RaceRules.validateWindow(startAt, endAt);

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
    if (!crewMatchRepository.findActiveByCrewId(myCrew.getId(), now).isEmpty()) {
      throw ApiException.conflict("match_already_active");
    }
    if (!crewMatchRepository.findActiveByCrewId(opponent.getId(), now).isEmpty()) {
      throw ApiException.conflict("opponent_busy");
    }

    List<CrewMember> myRoster = validateRoster(myCrew.getId(), rosterUserIds, rosterSize);

    CrewMatch match = crewMatchRepository.save(CrewMatch.builder()
        .challengerCrew(myCrew)
        .opponentCrew(opponent)
        .rosterSize(rosterSize)
        .startAt(startAt)
        .endAt(endAt)
        .createdAt(now)
        .build());
    saveRoster(match, myCrew.getId(), myRoster);

    // 커밋 후 상대 크루 리더에게 도전장 도착 푸시 — 방치로 인한 슬롯 잠금 완화.
    eventPublisher.publishEvent(new CrewMatchEvents.ChallengeReceived(
        opponent.getLeader().getId(), myCrew.getName(), match.getId()));
  }

  /**
   * 도전장 수락(상대 크루 리더 전용) — 수락 크루 로스터 지명. 기간은 도전장 작성 시 이미
   * 확정돼 있으므로(레이스 등록과 동일) 상태 전이만 한다. 시작 전까지만 수락할 수 있다.
   */
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
        .findActiveByCrewId(match.getChallengerCrew().getId(), now).stream()
        .anyMatch(m -> !m.getId().equals(match.getId()) && m.getStatus() == CrewMatch.Status.ACCEPTED);
    if (challengerBusy) {
      throw ApiException.conflict("opponent_busy");
    }

    List<CrewMember> roster = validateRoster(myCrew.getId(), rosterUserIds, match.getRosterSize());

    match.accept();
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
    eventPublisher.publishEvent(new CrewMatchEvents.ChallengeDeclined(
        match.getChallengerCrew().getLeader().getId(), myCrew.getName(), match.getId()));
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
    for (CrewMatch m : crewMatchRepository.findActiveByCrewId(crewId, now)) {
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
    boolean alivePending = match.getStatus() == CrewMatch.Status.PENDING && isAlivePending(match, now);
    return new CrewMatchDetailResponse(
        match.getId(),
        derivedStatus(match, now),
        match.getChallengerCrew().getName(),
        match.getOpponentCrew().getName(),
        myCrewIsChallenger,
        match.getRosterSize(),
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

  /**
   * 기간(endAt)이 지난 ACCEPTED 매치를 확정한다 — CrewMatchScheduler가 주기적으로 호출해,
   * 아무도 조회하지 않아도 종료 확정 + 결과 푸시가 나가게 한다. 확정했으면 true.
   */
  @Transactional
  public boolean finalizeIfTimeEnded(long matchId, OffsetDateTime now) {
    CrewMatch match = crewMatchRepository.findByIdWithCrews(matchId).orElse(null);
    if (match == null) return false; // 그사이 삭제됐으면 건너뜀
    if (match.getStatus() != CrewMatch.Status.ACCEPTED || match.isEnded()) return false;
    if (match.getEndAt() == null || now.isBefore(match.getEndAt())) return false;
    finalizeEnded(match);
    return true;
  }

  /**
   * GPS 워크아웃 저장 직후(WorkoutService.create) 호출 — 사용자가 진행 중인 대항전 로스터에
   * 있으면 방금 그 운동으로 자기 크루가 상대를 추월했는지 확인해, 추월당한 쪽 로스터 전원에게
   * 알린다. 진행 중인 대항전이 없거나 이 운동이 대항전 기간 밖이면 아무 일도 하지 않는다.
   */
  @Transactional
  public void checkOvertakeOnWorkout(UUID userId, int distanceM, OffsetDateTime workoutEndedAt) {
    OffsetDateTime now = OffsetDateTime.now();
    CrewMatchRoster myRoster = crewMatchRosterRepository.findActiveByUserId(userId, now).orElse(null);
    if (myRoster == null) return;

    CrewMatch match = myRoster.getMatch();
    if (workoutEndedAt.isBefore(match.getStartAt()) || !workoutEndedAt.isBefore(match.getEndAt())) {
      return; // 이 운동은 대항전 채점 구간 밖 — memberDistances 집계에 반영되지 않는다.
    }

    List<CrewMatchRoster> rosters = crewMatchRosterRepository.findAllByMatchId(match.getId());
    Map<UUID, Long> byUser = memberDistances(match, rosters, now);
    Long challengerId = match.getChallengerCrew().getId();
    long challengerSum = 0;
    long opponentSum = 0;
    for (CrewMatchRoster r : rosters) {
      long dist = byUser.getOrDefault(r.getUser().getId(), 0L);
      if (r.getCrewId().equals(challengerId)) challengerSum += dist; else opponentSum += dist;
    }

    boolean mySideIsChallenger = myRoster.getCrewId().equals(challengerId);
    long myNextSum = mySideIsChallenger ? challengerSum : opponentSum;
    long otherSum = mySideIsChallenger ? opponentSum : challengerSum;
    long myPrevSum = myNextSum - distanceM; // 방금 반영된 이 운동만큼 제외한 직전 상태

    // 직전엔 뒤지거나 동률이었는데 이 운동으로 앞서게 됐으면 방금 추월한 것.
    if (myPrevSum > otherSum || myNextSum <= otherSum) return;

    Crew overtakerCrew = mySideIsChallenger ? match.getChallengerCrew() : match.getOpponentCrew();
    Long overtakenCrewId = mySideIsChallenger ? match.getOpponentCrew().getId() : challengerId;
    List<UUID> overtakenUserIds = rosters.stream()
        .filter(r -> r.getCrewId().equals(overtakenCrewId))
        .map(r -> r.getUser().getId())
        .toList();
    if (overtakenUserIds.isEmpty()) return;

    eventPublisher.publishEvent(new CrewMatchEvents.MatchOvertake(
        match.getId(), overtakerCrew.getName(), overtakenUserIds));
  }

  // ── 내부 헬퍼 ─────────────────────────────────────────────────

  /** 기간 종료된 ACCEPTED 매치의 승자를 확정하고, 로스터 전원에게 결과 푸시를 발행한다. */
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
    publishMatchEnded(match, rosters, winner);
  }

  /** 로스터 전원에게 결과(WIN|LOSS|DRAW) 푸시 이벤트를 발행한다. 로스터가 없으면(수락 전 소멸 등) 생략. */
  private void publishMatchEnded(CrewMatch match, List<CrewMatchRoster> rosters, Long winnerCrewId) {
    if (rosters.isEmpty()) return;
    Long challengerId = match.getChallengerCrew().getId();
    String challengerName = match.getChallengerCrew().getName();
    String opponentName = match.getOpponentCrew().getName();
    List<CrewMatchEvents.MatchEnded.RosterResult> receivers = new ArrayList<>();
    for (CrewMatchRoster r : rosters) {
      boolean isChallengerSide = r.getCrewId().equals(challengerId);
      String opponentCrewName = isChallengerSide ? opponentName : challengerName;
      String result = winnerCrewId == null
          ? "DRAW"
          : (winnerCrewId.equals(r.getCrewId()) ? "WIN" : "LOSS");
      receivers.add(new CrewMatchEvents.MatchEnded.RosterResult(
          r.getUser().getId(), opponentCrewName, result));
    }
    eventPublisher.publishEvent(new CrewMatchEvents.MatchEnded(match.getId(), receivers));
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
      case PENDING -> isAlivePending(match, now) ? "PENDING" : "EXPIRED";
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

  /**
   * PENDING 도전장이 아직 살아있는가 — 시작일시 전까지만 수락할 수 있다
   * (레이스의 "시작 전까지만 참가 가능" 원칙과 동일). start_at이 없는 행(레거시)은 만료로 본다.
   */
  private static boolean isAlivePending(CrewMatch match, OffsetDateTime now) {
    return match.getStartAt() != null && now.isBefore(match.getStartAt());
  }

  private void requireAlivePending(CrewMatch match, OffsetDateTime now) {
    if (match.getStatus() != CrewMatch.Status.PENDING) {
      throw ApiException.conflict("match_not_pending");
    }
    if (!isAlivePending(match, now)) {
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
