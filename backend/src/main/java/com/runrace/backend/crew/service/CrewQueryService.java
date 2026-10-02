package com.runrace.backend.crew.service;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.KstTime;
import com.runrace.backend.common.PageParams;
import com.runrace.backend.crew.domain.Crew;
import com.runrace.backend.crew.domain.CrewMember;
import com.runrace.backend.crew.dto.CrewDetailResponse;
import com.runrace.backend.crew.dto.CrewInsightsResponse;
import com.runrace.backend.crew.dto.MyCrewResponse;
import com.runrace.backend.crew.dto.MyCrewResponse.CrewMemberRow;
import com.runrace.backend.crew.dto.MyCrewResponse.CrewView;
import com.runrace.backend.crew.repository.CrewJoinRequestRepository;
import com.runrace.backend.crew.repository.CrewMemberRepository;
import com.runrace.backend.crew.repository.CrewRepository;
import com.runrace.backend.user.domain.AppUser;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 크루 보드, 검색, 발견, 상세와 인사이트 조회를 전담한다. */
@Service
@RequiredArgsConstructor
public class CrewQueryService {
  private static final int PROFILE_IMAGE_MAX = 4;
  private static final int APPLY_COOLDOWN_HOURS = 24;
  private static final Set<String> VALID_REGIONS = Set.of(
      "SEOUL", "BUSAN", "DAEGU", "INCHEON", "GWANGJU", "DAEJEON", "ULSAN", "SEJONG",
      "GYEONGGI_SOUTH", "GYEONGGI_NORTH", "GANGWON", "CHUNGBUK", "CHUNGNAM", "JEONBUK", "JEONNAM",
      "GYEONGBUK", "GYEONGNAM", "JEJU", "ONLINE", "ETC");

  private final CrewRepository crewRepository;
  private final CrewMemberRepository crewMemberRepository;
  private final CrewJoinRequestRepository crewJoinRequestRepository;
  private final CrewProfileImages crewProfileImages;
  private final CrewInsightsReader crewInsightsReader;

  @Transactional(readOnly = true)
  public MyCrewResponse myCrew(UUID meId) {
    Optional<CrewMember> membership = crewMemberRepository.findByUserId(meId);
    if (membership.isEmpty()) return new MyCrewResponse(null);

    Crew crew = membership.get().getCrew();
    List<CrewMember> members = crewMemberRepository.findAllByCrewIdOrderByJoinedAtAsc(crew.getId());
    Map<UUID, long[]> aggregate = sumMonthDistanceByMember(crew.getId(), monthStartKst());
    long allTime = crewMemberRepository.sumMemberDistanceSinceJoin(crew.getId());
    List<CrewMemberRow> rows = toBoardRows(crew, members, aggregate, meId);
    return new MyCrewResponse(new CrewView(
        crew.getId(), crew.getName(), crew.getNotice(), crew.getJoinCode(),
        crew.isLeader(meId), crew.getMaxMembers(), crew.getMonthGoalKm(),
        allTime, rows));
  }

  @Transactional(readOnly = true)
  public List<CrewRepository.CrewSearchRow> search(UUID meId, String rawQuery) {
    String query = rawQuery == null ? "" : rawQuery.trim().replaceAll("[%_]", "");
    long excludeCrewId = crewMemberRepository.findByUserId(meId)
        .map(member -> member.getCrew().getId())
        .orElse(-1L);
    return crewRepository.searchByName(query, excludeCrewId);
  }

  @Transactional(readOnly = true)
  public List<CrewRepository.CrewDiscoveryRow> discover(String regionCode, int page, int size) {
    PageParams.Clamped clamped = PageParams.clamp(page, size);
    String region = regionCode == null ? "" : regionCode.trim().toUpperCase();
    if (!region.isEmpty() && !VALID_REGIONS.contains(region)) {
      throw ApiException.badRequest("invalid_region");
    }
    return crewRepository.findDiscoverableRich(
        region, clamped.size() + 1, (long) clamped.page() * clamped.size());
  }

  @Transactional(readOnly = true)
  public CrewDetailResponse detail(long crewId, UUID viewerId) {
    Crew crew = crewRepository.getRequired(crewId);
    int memberCount = crewMemberRepository.countByCrewId(crewId);
    boolean inCooldown = viewerId != null && isInCooldown(crewId, viewerId);
    return new CrewDetailResponse(
        crew.getId(), crew.getName(), crew.getRegion(), crew.getImageUrl(),
        crewProfileImages.from(crew, PROFILE_IMAGE_MAX), crew.getIntro(),
        memberCount, crew.getMaxMembers(),
        crew.getMeetupPlace(), parseMeetupDaysCsv(crew.getMeetupDays()), crew.getMeetupTime(),
        crew.getCreatedAt(), crew.getFoundedAt(), crew.getLeader().getNickname(),
        memberCount >= crew.getMaxMembers(), inCooldown);
  }

  @Transactional(readOnly = true)
  public CrewInsightsResponse insights(UUID meId) {
    CrewMember membership = CrewGuards.requireMembership(crewMemberRepository, meId);
    Crew crew = membership.getCrew();
    List<CrewMember> members = crewMemberRepository.findAllByCrewIdOrderByJoinedAtAsc(crew.getId());
    return crewInsightsReader.read(crew.getId(), members);
  }

  private Map<UUID, long[]> sumMonthDistanceByMember(Long crewId, OffsetDateTime monthStart) {
    Map<UUID, long[]> aggregate = new HashMap<>();
    for (var row : crewMemberRepository.sumMemberDistanceSince(crewId, monthStart)) {
      aggregate.put(row.getUserId(), new long[] {row.getDistanceM(), row.getRuns()});
    }
    return aggregate;
  }

  private static List<CrewMemberRow> toBoardRows(
      Crew crew, List<CrewMember> members, Map<UUID, long[]> aggregate, UUID meId) {
    return members.stream()
        .map(member -> {
          AppUser user = member.getUser();
          long[] totals = aggregate.getOrDefault(user.getId(), new long[] {0, 0});
          return new CrewMemberRow(
              user.getId(), user.getNickname(), crew.isLeader(user.getId()), user.getId().equals(meId),
              totals[0], (int) totals[1]);
        })
        .sorted(Comparator.comparingLong(CrewMemberRow::monthDistanceM).reversed())
        .toList();
  }

  private static OffsetDateTime monthStartKst() {
    LocalDate firstOfMonth = LocalDate.now(KstTime.ZONE).withDayOfMonth(1);
    return firstOfMonth.atStartOfDay(KstTime.ZONE).toOffsetDateTime();
  }

  private static int[] parseMeetupDaysCsv(String csv) {
    if (csv == null || csv.isBlank()) return new int[0];
    return Arrays.stream(csv.split(",")).mapToInt(Integer::parseInt).toArray();
  }

  private boolean isInCooldown(long crewId, UUID userId) {
    return crewJoinRequestRepository.findLastRejectedAt(crewId, userId)
        .map(last -> last.isAfter(OffsetDateTime.now().minusHours(APPLY_COOLDOWN_HOURS)))
        .orElse(false);
  }
}
