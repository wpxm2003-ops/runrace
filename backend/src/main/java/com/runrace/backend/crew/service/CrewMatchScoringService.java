package com.runrace.backend.crew.service;

import com.runrace.backend.crew.domain.CrewMatch;
import com.runrace.backend.crew.domain.CrewMatchRoster;
import com.runrace.backend.workout.domain.WorkoutType;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/** Calculates roster distances and crew totals using the shared match scoring rules. */
@Service
@RequiredArgsConstructor
class CrewMatchScoringService {

  private final WorkoutSessionRepository workoutSessionRepository;

  Map<UUID, Long> memberDistances(
      CrewMatch match, List<CrewMatchRoster> rosters, OffsetDateTime now) {
    Map<UUID, Long> byUser = new HashMap<>();
    if (match.getStartAt() == null || rosters.isEmpty() || now.isBefore(match.getStartAt())) {
      return byUser;
    }
    OffsetDateTime to = now.isBefore(match.getEndAt()) ? now : match.getEndAt();
    List<UUID> userIds = rosters.stream().map(roster -> roster.getUser().getId()).toList();
    for (var row : workoutSessionRepository.aggregateDistanceBetweenByType(
        userIds, match.getStartAt(), to, WorkoutType.GPS)) {
      byUser.put(row.getUserId(), row.getDistanceM());
    }
    return byUser;
  }

  CrewSums crewSums(CrewMatch match, List<CrewMatchRoster> rosters, OffsetDateTime now) {
    return sumByCrew(match, rosters, memberDistances(match, rosters, now));
  }

  CrewSums sumByCrew(
      CrewMatch match, List<CrewMatchRoster> rosters, Map<UUID, Long> byUser) {
    Long challengerId = match.getChallengerCrew().getId();
    long challengerSum = 0;
    long opponentSum = 0;
    for (CrewMatchRoster roster : rosters) {
      long distance = byUser.getOrDefault(roster.getUser().getId(), 0L);
      if (roster.getCrewId().equals(challengerId)) {
        challengerSum += distance;
      } else {
        opponentSum += distance;
      }
    }
    return new CrewSums(challengerSum, opponentSum);
  }

  record CrewSums(long challenger, long opponent) {}
}
