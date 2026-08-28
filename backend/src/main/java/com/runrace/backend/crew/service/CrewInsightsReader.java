package com.runrace.backend.crew.service;

import com.runrace.backend.common.KstTime;
import com.runrace.backend.crew.domain.CrewMember;
import com.runrace.backend.crew.dto.CrewInsightsResponse;
import com.runrace.backend.crew.repository.CrewMemberRepository;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** Read model builder for the crew activity heatmap and completed-month hall of fame. */
@Component
@RequiredArgsConstructor
class CrewInsightsReader {

  private static final ZoneId KST = KstTime.ZONE;
  private static final int HALL_OF_FAME_MONTHS = 12;

  private final CrewMemberRepository crewMemberRepository;

  CrewInsightsResponse read(long crewId, List<CrewMember> members) {
    OffsetDateTime heatmapFrom = monthStartKst();
    List<CrewInsightsResponse.DayCell> heatmap = buildHeatmap(crewId, members, heatmapFrom);
    List<CrewInsightsResponse.HallEntry> hallOfFame =
        buildHallOfFame(crewId, members, heatmapFrom.minusMonths(HALL_OF_FAME_MONTHS));

    return new CrewInsightsResponse(
        heatmapFrom.atZoneSameInstant(KST).toLocalDate().toString(),
        members.size(), heatmap, hallOfFame);
  }

  private List<CrewInsightsResponse.DayCell> buildHeatmap(
      long crewId, List<CrewMember> members, OffsetDateTime heatmapFrom) {
    Map<LocalDate, Set<UUID>> runnersByDay = new HashMap<>();
    for (var row : crewMemberRepository.findDailyRunners(crewId, heatmapFrom)) {
      runnersByDay.computeIfAbsent(row.getDay(), ignored -> new HashSet<>()).add(row.getUserId());
    }
    return runnersByDay.entrySet().stream()
        .map(entry -> {
          List<String> names = members.stream()
              .filter(member -> entry.getValue().contains(member.getUser().getId()))
              .map(member -> member.getUser().getNickname())
              .filter(Objects::nonNull)
              .limit(10)
              .toList();
          return new CrewInsightsResponse.DayCell(
              entry.getKey().toString(), entry.getValue().size(), names);
        })
        .toList();
  }

  private List<CrewInsightsResponse.HallEntry> buildHallOfFame(
      long crewId, List<CrewMember> members, OffsetDateTime from) {
    Map<UUID, String> nicknames = new HashMap<>();
    for (CrewMember member : members) {
      nicknames.put(member.getUser().getId(), member.getUser().getNickname());
    }

    String currentYm = LocalDate.now(KST).toString().substring(0, 7);
    Map<String, CrewInsightsResponse.HallEntry> bestByMonth = new HashMap<>();
    for (var row : crewMemberRepository.aggregateMonthlyMemberDistance(crewId, from)) {
      if (row.getYm().compareTo(currentYm) >= 0) continue;
      CrewInsightsResponse.HallEntry current = bestByMonth.get(row.getYm());
      if (current == null || row.getDistanceM() > current.distanceM()) {
        bestByMonth.put(row.getYm(), new CrewInsightsResponse.HallEntry(
            row.getYm(), nicknames.get(row.getUserId()), row.getDistanceM()));
      }
    }
    return bestByMonth.values().stream()
        .sorted(Comparator.comparing(CrewInsightsResponse.HallEntry::month).reversed())
        .limit(HALL_OF_FAME_MONTHS)
        .toList();
  }

  private static OffsetDateTime monthStartKst() {
    return LocalDate.now(KST).withDayOfMonth(1).atStartOfDay(KST).toOffsetDateTime();
  }
}
