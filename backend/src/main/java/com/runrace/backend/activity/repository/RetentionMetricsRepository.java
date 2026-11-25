package com.runrace.backend.activity.repository;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * 관리자 재방문 지표의 원천 조회. 숫자 계산(평균·코호트 판정)은 서비스가 하고, 여기서는
 * "어느 사용자가 어느 현지 날짜에 활동했는가"와 기간별 사용자 수만 돌려준다.
 *
 * <p>모든 조회는 운영자 계정을 뺀다(관리자 대시보드의 다른 목록과 같은 기준). 탈퇴 익명화로
 * display_name이 null인 사용자는 반드시 포함해야 한다 — {@code NULL NOT IN (...)}은 true가
 * 아니라 NULL이라 조건만 걸면 탈퇴 회원이 통째로 빠진다.
 */
@Repository
@RequiredArgsConstructor
public class RetentionMetricsRepository {
  private final NamedParameterJdbcTemplate jdbc;

  /**
   * 활동의 두 기준. 테이블·날짜 표현은 이 상수에서만 오고 사용자 입력은 섞이지 않는다.
   *
   * <ul>
   *   <li>VISITS — user_daily_active.local_date(핑 시점 users.time_zone 기준 날짜). 배포 이후부터 쌓인다.
   *   <li>RUNS — workout_session.started_at_local의 날짜(기기 현지 벽시계). 과거 데이터로 바로 계산된다.
   * </ul>
   */
  public enum Basis {
    VISITS(
        "user_daily_active",
        "a.local_date",
        "a.local_date >= :fromDate and a.local_date < :toDateExclusive"),
    RUNS(
        "workout_session",
        "(a.started_at_local::date)",
        "a.started_at_local >= :fromTs and a.started_at_local < :toTsExclusive");

    private final String table;
    private final String dayExpr;
    private final String rangePredicate;

    Basis(String table, String dayExpr, String rangePredicate) {
      this.table = table;
      this.dayExpr = dayExpr;
      this.rangePredicate = rangePredicate;
    }
  }

  /** [from, to] 각 날짜의 활동 사용자 수. 활동이 없던 날은 맵에 없다. */
  public Map<LocalDate, Long> dailyActiveUsers(
      Basis basis, LocalDate from, LocalDate to, List<String> excludedNames) {
    String sql = "select " + basis.dayExpr + " as day, count(distinct a.user_id) as users "
        + from(basis) + " where " + basis.rangePredicate + operatorFilter(excludedNames)
        + " group by 1";
    Map<LocalDate, Long> result = new HashMap<>();
    for (DayCount row : jdbc.query(sql, rangeParams(from, to, excludedNames), (rs, rowNum) ->
        new DayCount(rs.getObject("day", LocalDate.class), rs.getLong("users")))) {
      result.put(row.day(), row.users());
    }
    return result;
  }

  private record DayCount(LocalDate day, long users) {}

  /** [from, to] 기간에 한 번이라도 활동한 서로 다른 사용자 수(WAU·MAU·당일 DAU). */
  public long distinctActiveUsers(
      Basis basis, LocalDate from, LocalDate to, List<String> excludedNames) {
    String sql = "select count(distinct a.user_id) " + from(basis)
        + " where " + basis.rangePredicate + operatorFilter(excludedNames);
    Long count = jdbc.queryForObject(sql, rangeParams(from, to, excludedNames), Long.class);
    return count == null ? 0 : count;
  }

  /**
   * 가입 시각이 {@code createdFrom} 이후인 사용자들의 [from, to] 활동 날짜(사용자·날짜 중복 제거).
   * 코호트 재방문 판정의 입력이다.
   */
  public List<UserDay> activeDaysOfSignups(
      Basis basis,
      OffsetDateTime createdFrom,
      LocalDate from,
      LocalDate to,
      List<String> excludedNames) {
    String sql = "select distinct a.user_id as user_id, " + basis.dayExpr + " as day "
        + from(basis) + " where u.created_at >= :createdFrom and " + basis.rangePredicate
        + operatorFilter(excludedNames);
    MapSqlParameterSource params = rangeParams(from, to, excludedNames)
        .addValue("createdFrom", createdFrom);
    return jdbc.query(sql, params, (rs, rowNum) -> new UserDay(
        rs.getObject("user_id", UUID.class), rs.getObject("day", LocalDate.class)));
  }

  /** 방문 기록의 가장 이른 날짜 — 수집 시작일(배포일) 판정용. 기록이 없으면 empty. */
  public Optional<LocalDate> firstVisitDate() {
    return Optional.ofNullable(jdbc.getJdbcTemplate().queryForObject(
        "select min(local_date) from user_daily_active", LocalDate.class));
  }

  /** 가입 시각이 {@code createdFrom} 이후인 사용자(탈퇴 회원 포함, 운영자 제외). */
  public List<SignupRow> signupsSince(OffsetDateTime createdFrom, List<String> excludedNames) {
    String sql = "select u.id, u.created_at, u.time_zone from users u "
        + "where u.created_at >= :createdFrom" + operatorFilter(excludedNames);
    MapSqlParameterSource params = new MapSqlParameterSource("createdFrom", createdFrom);
    addExcluded(params, excludedNames);
    return jdbc.query(sql, params, (rs, rowNum) -> new SignupRow(
        rs.getObject("id", UUID.class),
        rs.getObject("created_at", OffsetDateTime.class),
        rs.getString("time_zone")));
  }

  public record UserDay(UUID userId, LocalDate day) {}

  public record SignupRow(UUID userId, OffsetDateTime createdAt, String timeZone) {}

  private static String from(Basis basis) {
    return "from " + basis.table + " a join users u on u.id = a.user_id";
  }

  private static String operatorFilter(List<String> excludedNames) {
    if (excludedNames == null || excludedNames.isEmpty()) return "";
    return " and (u.display_name is null or u.display_name not in (:excludedNames))";
  }

  private static MapSqlParameterSource rangeParams(
      LocalDate from, LocalDate to, List<String> excludedNames) {
    MapSqlParameterSource params = new MapSqlParameterSource()
        .addValue("fromDate", from)
        .addValue("toDateExclusive", to.plusDays(1))
        .addValue("fromTs", from.atStartOfDay())
        .addValue("toTsExclusive", to.plusDays(1).atStartOfDay());
    addExcluded(params, excludedNames);
    return params;
  }

  private static void addExcluded(MapSqlParameterSource params, List<String> excludedNames) {
    if (excludedNames != null && !excludedNames.isEmpty()) {
      params.addValue("excludedNames", excludedNames);
    }
  }
}
