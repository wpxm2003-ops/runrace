package com.runrace.backend.crew.repository;

import com.runrace.backend.crew.domain.Crew;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CrewRepository extends JpaRepository<Crew, Long> {
  Optional<Crew> findByJoinCode(String joinCode);

  boolean existsByJoinCode(String joinCode);

  boolean existsByName(String name);

  /** 대항전 상대 지목용 — 크루명은 unique라 정확 일치로 찾는다. */
  Optional<Crew> findByName(String name);

  /**
   * 크루 검색(도전장 상대 선택용) — 이름 부분일치(대소문자 무시), 멤버 많은 순 상위 30개.
   * {@code excludeCrewId}로 내 크루를 제외한다(미소속이면 -1).
   */
  @Query(value = """
      select c.id as "id", c.name as "name", count(m.id) as "memberCount"
      from crew c
      left join crew_member m on m.crew_id = c.id
      where (:query = '' or c.name ilike ('%' || :query || '%'))
        and c.id <> :excludeCrewId
      group by c.id, c.name
      order by count(m.id) desc, c.id desc
      limit 30
      """, nativeQuery = true)
  List<CrewSearchRow> searchByName(
      @Param("query") String query, @Param("excludeCrewId") long excludeCrewId);

  /**
   * 발견 목록(리치) — 지역 필터(빈 문자열=전체), 멤버 수 내림차순, 동률은 최신 크루 우선.
   * 카드 렌더에 필요한 필드만 투영(intro는 상세 전용이라 제외).
   */
  @Query(value = """
      select c.id as "id", c.name as "name", c.region as "region", c.image_url as "imageUrl",
             c.max_members as "maxMembers", c.meetup_place as "meetupPlace",
             c.meetup_days as "meetupDays", c.meetup_time as "meetupTime",
             count(m.id) as "memberCount"
      from crew c
      left join crew_member m on m.crew_id = c.id
      where (:region = '' or c.region = :region)
      group by c.id, c.name, c.region, c.image_url, c.max_members,
               c.meetup_place, c.meetup_days, c.meetup_time
      order by count(m.id) desc, c.id desc
      limit :limit offset :offset
      """, nativeQuery = true)
  List<CrewDiscoveryRow> findDiscoverableRich(
      @Param("region") String region, @Param("limit") int limit, @Param("offset") long offset);

  /** {@link #searchByName} 결과 투영. */
  interface CrewSearchRow {
    Long getId();
    String getName();
    int getMemberCount();
  }

  /** {@link #findDiscoverableRich} 결과 투영. */
  interface CrewDiscoveryRow {
    Long getId();
    String getName();
    String getRegion();
    String getImageUrl();
    int getMaxMembers();
    String getMeetupPlace();
    String getMeetupDays();
    String getMeetupTime();
    int getMemberCount();
  }
}
