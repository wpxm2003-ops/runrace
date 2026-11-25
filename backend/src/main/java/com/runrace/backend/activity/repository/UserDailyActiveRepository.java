package com.runrace.backend.activity.repository;

import com.runrace.backend.activity.domain.ClientPlatform;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * user_daily_active 쓰기 경로. 엔티티 생명주기가 필요 없는 사실(fact) 테이블이라 JPA 대신
 * 한 문장짜리 SQL로 다룬다 — 중복 핑을 DB 제약으로 흡수하는 {@code on conflict do nothing}을
 * 그대로 쓸 수 있고, 앱 컨텍스트 없이 실제 PostgreSQL에 붙여 검증할 수 있다.
 */
@Repository
@RequiredArgsConstructor
public class UserDailyActiveRepository {
  private final NamedParameterJdbcTemplate jdbc;

  /**
   * 그 날 그 플랫폼의 첫 핑이면 한 행을 남기고, 이미 있으면 아무것도 하지 않는다.
   * 동시에 들어온 같은 핑도 기본 키 충돌로 한 행만 남는다.
   *
   * @return 새로 기록했으면 true, 이미 있던 날이면 false
   */
  public boolean insertIfAbsent(
      UUID userId, LocalDate localDate, ClientPlatform platform, OffsetDateTime createdAt) {
    int inserted = jdbc.update("""
        insert into user_daily_active (user_id, local_date, platform, created_at)
        values (:userId, :localDate, :platform, :createdAt)
        on conflict (user_id, local_date, platform) do nothing
        """,
        Map.of(
            "userId", userId,
            "localDate", localDate,
            "platform", platform.code(),
            "createdAt", createdAt));
    return inserted > 0;
  }

  /** 탈퇴 시 그 사용자의 방문 기록을 모두 지운다. */
  public int deleteAllByUser(UUID userId) {
    return jdbc.update(
        "delete from user_daily_active where user_id = :userId", Map.of("userId", userId));
  }

  /**
   * 보존 기간이 지난 행을 배치 단위로 지운다(기본 키가 복합 키라 ctid로 상한을 건다).
   *
   * @return 실제로 삭제된 행 수 — batchSize 미만이면 더 지울 것이 없다는 뜻이다.
   */
  public int deleteOlderThan(LocalDate cutoff, int batchSize) {
    return jdbc.update("""
        delete from user_daily_active
        where ctid = any(array(
          select ctid from user_daily_active where local_date < :cutoff limit :batchSize))
        """,
        Map.of("cutoff", cutoff, "batchSize", batchSize));
  }
}
