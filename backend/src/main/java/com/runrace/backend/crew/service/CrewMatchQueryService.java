package com.runrace.backend.crew.service;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.IsoTime;
import com.runrace.backend.common.PageParams;
import com.runrace.backend.crew.domain.CrewMatch;
import com.runrace.backend.crew.domain.CrewMatchRoster;
import com.runrace.backend.crew.domain.CrewMember;
import com.runrace.backend.crew.dto.CrewMatchDetailResponse;
import com.runrace.backend.crew.dto.CrewMatchDetailResponse.RosterRow;
import com.runrace.backend.crew.dto.CrewMatchHistoryPage;
import com.runrace.backend.crew.dto.CrewMatchSummary;
import com.runrace.backend.crew.dto.MyCrewMatchesResponse;
import com.runrace.backend.crew.dto.MyCrewMatchesResponse.MatchRecord;
import com.runrace.backend.crew.repository.CrewMatchRepository;
import com.runrace.backend.crew.repository.CrewMatchRosterRepository;
import com.runrace.backend.crew.repository.CrewMemberRepository;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Owns crew-match reads and response composition. */
@Service
@RequiredArgsConstructor
public class CrewMatchQueryService {
  private final CrewMemberRepository crewMemberRepository;
  private final CrewMatchRepository crewMatchRepository;
  private final CrewMatchRosterRepository crewMatchRosterRepository;
  private final CrewMatchService matchLifecycle;
  private final CrewMatchScoringService scoringService;

  @Transactional
  public MyCrewMatchesResponse myMatches(UUID meId) {
    Long crewId = CrewGuards.requireMembership(crewMemberRepository, meId).getCrew().getId();
    OffsetDateTime now = OffsetDateTime.now();
    ActiveMatches active = classifyActiveMatches(crewId, now);
    CrewMatchSummary lastEnded = crewMatchRepository
        .findEndedByCrewId(crewId, PageRequest.of(0, 1)).stream()
        .findFirst()
        .map(match -> toSummary(match, crewId, now))
        .orElse(null);
    MatchRecord record = new MatchRecord(
        crewMatchRepository.countWins(crewId),
        crewMatchRepository.countLosses(crewId),
        crewMatchRepository.countDraws(crewId));
    return new MyCrewMatchesResponse(
        record, active.current(), active.received(), active.sent(), lastEnded);
  }

  @Transactional
  public CrewMatchHistoryPage history(UUID meId, int page, int size) {
    Long crewId = CrewGuards.requireMembership(crewMemberRepository, meId).getCrew().getId();
    OffsetDateTime now = OffsetDateTime.now();
    PageParams.Clamped clamped = PageParams.clamp(page, size);
    var slice = crewMatchRepository.findHistoryByCrewId(
        crewId, PageRequest.of(clamped.page(), clamped.size()));
    List<CrewMatchSummary> items = slice.getContent().stream()
        .map(match -> {
          matchLifecycle.finalizeIfNeeded(match, now);
          return toSummary(match, crewId, now);
        })
        .toList();
    return new CrewMatchHistoryPage(items, slice.hasNext());
  }

  @Transactional
  public CrewMatchDetailResponse detail(UUID meId, long matchId) {
    CrewMember membership = CrewGuards.requireMembership(crewMemberRepository, meId);
    Long myCrewId = membership.getCrew().getId();
    CrewMatch match = crewMatchRepository.findByIdWithCrews(matchId)
        .orElseThrow(() -> ApiException.notFound("match_not_found"));
    if (!match.involves(myCrewId)) {
      throw ApiException.forbidden("not_participant");
    }
    OffsetDateTime now = OffsetDateTime.now();
    matchLifecycle.finalizeIfNeeded(match, now);
    RosterBoard board = buildRosterBoard(match, meId, now);
    boolean myCrewIsChallenger = match.getChallengerCrew().getId().equals(myCrewId);
    boolean isLeader = membership.getCrew().isLeader(meId);
    boolean alivePending = match.getStatus() == CrewMatch.Status.PENDING
        && isAlivePending(match, now);
    return new CrewMatchDetailResponse(
        match.getId(), derivedStatus(match, now),
        match.getChallengerCrew().getName(), match.getOpponentCrew().getName(),
        myCrewIsChallenger, match.getRosterSize(), IsoTime.format(match.getCreatedAt()),
        IsoTime.formatOrNull(match.getStartAt()), IsoTime.formatOrNull(match.getEndAt()),
        alivePending && !myCrewIsChallenger && isLeader,
        alivePending && !myCrewIsChallenger && isLeader,
        alivePending && myCrewIsChallenger && isLeader,
        board.challengerSum(), board.opponentSum(), result(match, myCrewId),
        board.challengerRows(), board.opponentRows());
  }

  private ActiveMatches classifyActiveMatches(Long crewId, OffsetDateTime now) {
    CrewMatchSummary current = null;
    List<CrewMatchSummary> received = new ArrayList<>();
    List<CrewMatchSummary> sent = new ArrayList<>();
    for (CrewMatch match : crewMatchRepository.findActiveByCrewId(crewId, now)) {
      if (matchLifecycle.finalizeIfNeeded(match, now)) continue;
      CrewMatchSummary summary = toSummary(match, crewId, now);
      if (match.getStatus() == CrewMatch.Status.ACCEPTED) current = summary;
      else if (match.getOpponentCrew().getId().equals(crewId)) received.add(summary);
      else sent.add(summary);
    }
    return new ActiveMatches(current, received, sent);
  }

  private CrewMatchSummary toSummary(CrewMatch match, Long myCrewId, OffsetDateTime now) {
    boolean myCrewIsChallenger = match.getChallengerCrew().getId().equals(myCrewId);
    long myDistance = 0;
    long opponentDistance = 0;
    if (match.isEnded()
        && match.getChallengerDistanceM() != null
        && match.getOpponentDistanceM() != null) {
      myDistance = myCrewIsChallenger
          ? match.getChallengerDistanceM() : match.getOpponentDistanceM();
      opponentDistance = myCrewIsChallenger
          ? match.getOpponentDistanceM() : match.getChallengerDistanceM();
    } else if (match.getStartAt() != null) {
      List<CrewMatchRoster> rosters = crewMatchRosterRepository.findAllByMatchId(match.getId());
      CrewMatchScoringService.CrewSums sums = scoringService.crewSums(match, rosters, now);
      myDistance = myCrewIsChallenger ? sums.challenger() : sums.opponent();
      opponentDistance = myCrewIsChallenger ? sums.opponent() : sums.challenger();
    }
    return new CrewMatchSummary(
        match.getId(), derivedStatus(match, now),
        match.getChallengerCrew().getName(), match.getOpponentCrew().getName(),
        myCrewIsChallenger, match.getRosterSize(),
        IsoTime.formatOrNull(match.getStartAt()), IsoTime.formatOrNull(match.getEndAt()),
        myDistance, opponentDistance, result(match, myCrewId));
  }

  private RosterBoard buildRosterBoard(CrewMatch match, UUID meId, OffsetDateTime now) {
    List<CrewMatchRoster> rosters = crewMatchRosterRepository.findAllByMatchId(match.getId());
    Map<UUID, Long> byUser = scoringService.memberDistances(match, rosters, now);
    Long challengerId = match.getChallengerCrew().getId();
    List<RosterRow> challengerRows = new ArrayList<>();
    List<RosterRow> opponentRows = new ArrayList<>();
    for (CrewMatchRoster roster : rosters) {
      long distance = byUser.getOrDefault(roster.getUser().getId(), 0L);
      RosterRow row = new RosterRow(
          roster.getUser().getId(), roster.getUser().getNickname(),
          roster.getUser().getId().equals(meId), distance);
      if (roster.getCrewId().equals(challengerId)) challengerRows.add(row);
      else opponentRows.add(row);
    }
    CrewMatchScoringService.CrewSums sums = scoringService.sumByCrew(match, rosters, byUser);
    long challengerSum = sums.challenger();
    long opponentSum = sums.opponent();
    Comparator<RosterRow> byDistance = Comparator.comparingLong(RosterRow::distanceM).reversed();
    challengerRows.sort(byDistance);
    opponentRows.sort(byDistance);
    if (match.isEnded()) {
      if (match.getChallengerDistanceM() != null) challengerSum = match.getChallengerDistanceM();
      if (match.getOpponentDistanceM() != null) opponentSum = match.getOpponentDistanceM();
    }
    return new RosterBoard(challengerRows, opponentRows, challengerSum, opponentSum);
  }

  private String derivedStatus(CrewMatch match, OffsetDateTime now) {
    return switch (match.getStatus()) {
      case DECLINED -> "DECLINED";
      case PENDING -> isAlivePending(match, now) ? "PENDING" : "EXPIRED";
      case ACCEPTED -> {
        if (match.isEnded()) yield "ENDED";
        if (match.getStartAt() == null || match.getEndAt() == null) yield "IN_PROGRESS";
        if (!now.isBefore(match.getEndAt())) yield "ENDED";
        yield now.isBefore(match.getStartAt()) ? "SCHEDULED" : "IN_PROGRESS";
      }
    };
  }

  private String result(CrewMatch match, Long myCrewId) {
    if (!match.isEnded()) return null;
    if (match.getWinnerCrewId() == null) return "DRAW";
    return match.getWinnerCrewId().equals(myCrewId) ? "WIN" : "LOSS";
  }

  private static boolean isAlivePending(CrewMatch match, OffsetDateTime now) {
    return match.getStartAt() != null && now.isBefore(match.getStartAt());
  }

  private record RosterBoard(
      List<RosterRow> challengerRows, List<RosterRow> opponentRows,
      long challengerSum, long opponentSum) {}

  private record ActiveMatches(
      CrewMatchSummary current, List<CrewMatchSummary> received, List<CrewMatchSummary> sent) {}
}
