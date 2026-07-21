package com.runrace.backend.crew.dto;

import com.runrace.backend.crew.repository.CrewRepository.CrewDiscoveryRow;
import java.util.Arrays;

/** 크루 발견 목록 카드 한 줄(리치) — 지역·이미지·정기런 요약. intro는 카드에 안 쓰여 상세 전용으로 제외. */
public record CrewDiscoveryItem(
    long id,
    String name,
    String region,
    String imageUrl,
    int memberCount,
    int maxMembers,
    String meetupPlace,
    int[] meetupDays,
    String meetupTime) {

  public static CrewDiscoveryItem from(CrewDiscoveryRow row) {
    return new CrewDiscoveryItem(
        row.getId(), row.getName(), row.getRegion(), row.getImageUrl(),
        row.getMemberCount(), row.getMaxMembers(),
        row.getMeetupPlace(), parseDays(row.getMeetupDays()), row.getMeetupTime());
  }

  private static int[] parseDays(String csv) {
    if (csv == null || csv.isBlank()) {
      return new int[0];
    }
    return Arrays.stream(csv.split(",")).mapToInt(Integer::parseInt).toArray();
  }
}
