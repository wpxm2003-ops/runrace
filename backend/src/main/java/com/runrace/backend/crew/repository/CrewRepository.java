package com.runrace.backend.crew.repository;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.crew.domain.Crew;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CrewRepository extends JpaRepository<Crew, Long> {

  /** id로 크루를 조회하되 없으면 404로 변환한다 — AppUserRepository.getRequired 관용구를 따른다. */
  default Crew getRequired(long id) {
    return findById(id).orElseThrow(() -> ApiException.notFound("crew_not_found"));
  }

  /**
   * 여러 크루가 얽힌 쓰기 작업용 행 잠금. 호출부가 id를 정렬해 전달하고 쿼리도 같은 순서를
   * 강제해 서로 반대 방향의 대항전 요청에서도 교착을 피한다.
   */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select c from Crew c where c.id in :ids order by c.id")
  List<Crew> findAllByIdsForUpdate(@Param("ids") List<Long> ids);

  Optional<Crew> findByJoinCode(String joinCode);

  boolean existsByJoinCode(String joinCode);

  boolean existsByName(String name);

  /**
   * 이 URL을 아직 참조 중인 크루가 있는지(image_urls JSON 배열 안 부분일치) —
   * 이미지 삭제 전 소유권 없는 URL 재사용 방어용. image_urls는 배열을 직렬화한 text 컬럼이라
   * 부분일치로 확인한다(우리가 발급하는 URL은 UUID 기반이라 부분 충돌 가능성이 사실상 없다).
   */
  boolean existsByImageUrlsJsonContaining(String imageUrl);

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
