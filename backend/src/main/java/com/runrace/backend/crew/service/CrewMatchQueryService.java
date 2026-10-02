package com.runrace.backend.crew.service;

import com.runrace.backend.common.PageParams;
import com.runrace.backend.crew.domain.CrewMatch;
import com.runrace.backend.crew.dto.CrewMatchHistoryPage;
import com.runrace.backend.crew.dto.CrewMatchSummary;
import com.runrace.backend.crew.dto.MyCrewMatchesResponse;
import com.runrace.backend.crew.dto.MyCrewMatchesResponse.MatchRecord;
import com.runrace.backend.crew.repository.CrewMatchRepository;
import com.runrace.backend.crew.repository.CrewMemberRepository;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 크루 대항전 목록 조회를 전담한다. 종료 시점 확정은 수명주기 서비스에 위임한다. */
@Service
@RequiredArgsConstructor
public class CrewMatchQueryService {

  private final CrewMemberRepository crewMemberRepository;
  private final CrewMatchRepository crewMatchRepository;
  private final CrewMatchService matchLifecycle;

  @Transactional
  public MyCrewMatchesResponse myMatches(UUID meId) {
    Long crewId = CrewGuards.requireMembership(crewMemberRepository, meId).getCrew().getId();
    OffsetDateTime now = OffsetDateTime.now();
    ActiveMatches active = classifyActiveMatches(crewId, now);
    CrewMatchSummary lastEnded = crewMatchRepository
        .findEndedByCrewId(crewId, PageRequest.of(0, 1)).stream()
        .findFirst()
        .map(match -> matchLifecycle.toSummary(match, crewId, now))
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
          return matchLifecycle.toSummary(match, crewId, now);
        })
        .toList();
    return new CrewMatchHistoryPage(items, slice.hasNext());
  }

  private ActiveMatches classifyActiveMatches(Long crewId, OffsetDateTime now) {
    CrewMatchSummary current = null;
    List<CrewMatchSummary> received = new ArrayList<>();
    List<CrewMatchSummary> sent = new ArrayList<>();
    for (CrewMatch match : crewMatchRepository.findActiveByCrewId(crewId, now)) {
      if (matchLifecycle.finalizeIfNeeded(match, now)) continue;
      CrewMatchSummary summary = matchLifecycle.toSummary(match, crewId, now);
      if (match.getStatus() == CrewMatch.Status.ACCEPTED) {
        current = summary;
      } else if (match.getOpponentCrew().getId().equals(crewId)) {
        received.add(summary);
      } else {
        sent.add(summary);
      }
    }
    return new ActiveMatches(current, received, sent);
  }

  private record ActiveMatches(
      CrewMatchSummary current, List<CrewMatchSummary> received, List<CrewMatchSummary> sent) {}
}
