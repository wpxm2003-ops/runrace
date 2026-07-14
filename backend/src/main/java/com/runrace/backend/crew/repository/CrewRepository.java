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

  /** 공개 크루 탐색 목록. 멤버 수가 같으면 최신 크루부터 안정적으로 페이징한다. */
  @Query(value = """
      select c.id as "id", c.name as "name", count(m.id) as "memberCount"
      from crew c
      left join crew_member m on m.crew_id = c.id
      group by c.id, c.name
      order by count(m.id) desc, c.id desc
      limit :limit offset :offset
      """, nativeQuery = true)
  List<CrewSearchRow> findDiscoverable(
      @Param("limit") int limit, @Param("offset") long offset);

  /** {@link #searchByName} 결과 투영. */
  interface CrewSearchRow {
    Long getId();
    String getName();
    int getMemberCount();
  }
}
