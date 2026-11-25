package com.runrace.backend.activity.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.runrace.backend.activity.domain.ClientPlatform;
import com.runrace.backend.activity.dto.RetentionMetricsResponse;
import com.runrace.backend.activity.dto.RetentionMetricsResponse.Cell;
import com.runrace.backend.activity.dto.RetentionMetricsResponse.Cohort;
import com.runrace.backend.activity.repository.RetentionMetricsRepository;
import com.runrace.backend.activity.repository.UserDailyActiveRepository;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * 실제 PostgreSQL에 V1~최신 마이그레이션을 올리고 시드 데이터로 숫자를 검증한다.
 *
 * <p>DB가 필요해 기본 {@code ./mvnw test}에서는 건너뛴다. 실행하려면 접속할 서버를 지정한다.
 * 테스트는 그 서버에 임시 데이터베이스를 새로 만들어 쓰고 끝나면 지우므로, 개발 DB의 기존
 * 데이터나 마이그레이션 이력은 건드리지 않는다(CREATE DATABASE 권한 필요).
 *
 * <pre>
 * RUNRACE_IT_DB_URL=jdbc:postgresql://127.0.0.1:5432/postgres
 * RUNRACE_IT_DB_USER=...  RUNRACE_IT_DB_PASSWORD=...
 * ./mvnw test -Dtest=RetentionMetricsPostgresTest
 * </pre>
 */
@EnabledIfEnvironmentVariable(named = "RUNRACE_IT_DB_URL", matches = ".+")
class RetentionMetricsPostgresTest {

  /** 2026-11-25(수) 12:00 KST. */
  private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-11-25T03:00:00Z");
  private static final List<String> EXCLUDED = List.of("노광고");

  private static String adminUrl;
  private static String dbUser;
  private static String dbPassword;
  private static String dbName;
  private static DriverManagerDataSource dataSource;

  private JdbcTemplate jdbc;
  private UserDailyActiveRepository dailyActive;
  private RetentionMetricsRepository metricsRepository;

  @BeforeAll
  static void createDatabase() throws Exception {
    adminUrl = System.getenv("RUNRACE_IT_DB_URL");
    dbUser = System.getenv("RUNRACE_IT_DB_USER");
    dbPassword = System.getenv("RUNRACE_IT_DB_PASSWORD");
    dbName = "runrace_it_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    try (Connection c = DriverManager.getConnection(adminUrl, dbUser, dbPassword);
        Statement s = c.createStatement()) {
      s.execute("create database " + dbName);
    }
    dataSource = new DriverManagerDataSource(
        adminUrl.replaceFirst("/[^/?]+(\\?|$)", "/" + dbName + "$1"), dbUser, dbPassword);
    Flyway.configure()
        .dataSource(dataSource)
        .locations("classpath:db/migration")
        .load()
        .migrate();
  }

  @AfterAll
  static void dropDatabase() throws Exception {
    if (dbName == null) return;
    try (Connection c = DriverManager.getConnection(adminUrl, dbUser, dbPassword);
        Statement s = c.createStatement()) {
      s.execute("drop database if exists " + dbName + " with (force)");
    }
  }

  @BeforeEach
  void setUp() {
    jdbc = new JdbcTemplate(dataSource);
    jdbc.execute("truncate table user_daily_active, workout_session, users cascade");
    NamedParameterJdbcTemplate named = new NamedParameterJdbcTemplate(jdbc);
    dailyActive = new UserDailyActiveRepository(named);
    metricsRepository = new RetentionMetricsRepository(named);
  }

  // ── 핑 upsert ───────────────────────────────────────────────────

  @Test
  void pingIsRecordedOncePerUserDayAndPlatform() {
    UUID user = insertUser("u", "Asia/Seoul", "2026-11-01T00:00:00Z", null);
    LocalDate day = LocalDate.parse("2026-11-25");

    assertTrue(dailyActive.insertIfAbsent(user, day, ClientPlatform.WEB, NOW));
    assertFalse(dailyActive.insertIfAbsent(user, day, ClientPlatform.WEB, NOW.plusHours(3)));
    // 같은 날 다른 플랫폼, 다른 날은 각각 한 행
    assertTrue(dailyActive.insertIfAbsent(user, day, ClientPlatform.ANDROID_APP, NOW));
    assertTrue(dailyActive.insertIfAbsent(user, day.plusDays(1), ClientPlatform.WEB, NOW));

    assertEquals(3, count("select count(*) from user_daily_active"));
    // 첫 핑 시각이 남는다(두 번째 핑이 덮어쓰지 않는다)
    assertEquals(NOW.toInstant(), jdbc.queryForObject(
        "select created_at from user_daily_active where platform = 'web' and local_date = ?",
        OffsetDateTime.class, day).toInstant());
  }

  /** 동시에 들어온 같은 핑도 기본 키 충돌로 정확히 한 번만 기록된다. */
  @Test
  void concurrentDuplicatePingsInsertExactlyOneRow() throws Exception {
    UUID user = insertUser("u", "Asia/Seoul", "2026-11-01T00:00:00Z", null);
    LocalDate day = LocalDate.parse("2026-11-25");
    int threads = 8;
    ExecutorService pool = Executors.newFixedThreadPool(threads);
    CountDownLatch start = new CountDownLatch(1);
    try {
      List<Future<Boolean>> results = new ArrayList<>();
      for (int i = 0; i < threads; i++) {
        Callable<Boolean> task = () -> {
          start.await();
          return dailyActive.insertIfAbsent(user, day, ClientPlatform.ANDROID_APP, NOW);
        };
        results.add(pool.submit(task));
      }
      start.countDown();
      int recorded = 0;
      for (Future<Boolean> f : results) if (f.get()) recorded++;

      assertEquals(1, recorded);
      assertEquals(1, count("select count(*) from user_daily_active"));
    } finally {
      pool.shutdownNow();
    }
  }

  @Test
  void purgeDeletesOnlyRowsOlderThanCutoffInBatches() {
    UUID user = insertUser("u", "Asia/Seoul", "2024-01-01T00:00:00Z", null);
    visit(user, "2025-01-01");
    visit(user, "2025-01-02");
    visit(user, "2025-06-01");
    visit(user, "2026-11-25");

    // 상한 1이면 한 번에 한 행만 지운다
    assertEquals(1, dailyActive.deleteOlderThan(LocalDate.parse("2025-06-01"), 1));
    assertEquals(1, dailyActive.deleteOlderThan(LocalDate.parse("2025-06-01"), 1000));
    assertEquals(0, dailyActive.deleteOlderThan(LocalDate.parse("2025-06-01"), 1000));
    // 기준일 당일은 남는다
    assertEquals(List.of(LocalDate.parse("2025-06-01"), LocalDate.parse("2026-11-25")),
        jdbc.queryForList(
            "select local_date from user_daily_active order by local_date", LocalDate.class));
  }

  @Test
  void deleteAllByUserRemovesOnlyThatUsersRows() {
    UUID leaving = insertUser("leaving", "Asia/Seoul", "2026-11-01T00:00:00Z", null);
    UUID staying = insertUser("staying", "Asia/Seoul", "2026-11-01T00:00:00Z", null);
    visit(leaving, "2026-11-24");
    visit(leaving, "2026-11-25");
    visit(staying, "2026-11-25");

    assertEquals(2, dailyActive.deleteAllByUser(leaving));
    assertEquals(1, count("select count(*) from user_daily_active"));
  }

  @Test
  void pingForWithdrawnUserIsNotRecorded() {
    UUID withdrawn = insertUser(null, "Asia/Seoul", "2026-11-01T00:00:00Z", "2026-11-20T00:00:00Z");

    assertFalse(dailyActive.insertIfAbsent(
        withdrawn, LocalDate.parse("2026-11-25"), ClientPlatform.WEB, NOW));
    assertFalse(dailyActive.insertIfAbsent(
        UUID.randomUUID(), LocalDate.parse("2026-11-25"), ClientPlatform.WEB, NOW));
    assertEquals(0, count("select count(*) from user_daily_active"));
  }

  /**
   * 인증을 통과한 핑이 탈퇴 트랜잭션(사용자 행 잠금 → 방문 기록 삭제 → 익명화) 도중에 들어오면,
   * 그 커밋을 기다렸다가 탈퇴를 보고 건너뛰어야 한다. 그냥 넣으면 삭제 뒤에 한 행이 남는다.
   * 탈퇴 쪽 잠금은 가장 약한 경우(for no key update — 키가 아닌 컬럼 UPDATE가 잡는 잠금)로 흉내 낸다.
   */
  @Test
  void pingRacingWithdrawalLeavesNoRowBehind() throws Exception {
    UUID user = insertUser("leaving", "Asia/Seoul", "2026-11-01T00:00:00Z", null);
    LocalDate day = LocalDate.parse("2026-11-25");
    ExecutorService pool = Executors.newSingleThreadExecutor();
    try (Connection withdrawal = dataSource.getConnection()) {
      withdrawal.setAutoCommit(false);
      try (var lock = withdrawal.prepareStatement(
          "select id from users where id = ? for no key update")) {
        lock.setObject(1, user);
        lock.executeQuery().close();
      }
      try (var delete = withdrawal.prepareStatement(
          "delete from user_daily_active where user_id = ?")) {
        delete.setObject(1, user);
        delete.executeUpdate();
      }
      try (var anonymize = withdrawal.prepareStatement(
          "update users set withdrawn_at = now(), display_name = null where id = ?")) {
        anonymize.setObject(1, user);
        anonymize.executeUpdate();
      }

      Future<Boolean> ping = pool.submit(
          () -> dailyActive.insertIfAbsent(user, day, ClientPlatform.WEB, NOW));
      Thread.sleep(500);
      assertFalse(ping.isDone(), "핑은 탈퇴 트랜잭션의 커밋을 기다려야 한다");

      withdrawal.commit();
      assertFalse(ping.get(10, TimeUnit.SECONDS));
    } finally {
      pool.shutdownNow();
    }
    assertEquals(0, count("select count(*) from user_daily_active"));
  }

  // ── 집계 ─────────────────────────────────────────────────────────

  /**
   * 시드 시나리오(기준: 2026-11-25 수 12:00 KST, 방문 수집 시작 11-20 → 판정은 11-21부터).
   *
   * <pre>
   * 사용자    시간대  현지 가입일        방문(local_date)              달리기(started_at_local)
   * alice    KST     11-16(월)          11-21, 11-23, 11-25(웹+앱)    11-17, 11-23 21:00, 11-24 23:59:59
   * bob      LA      11-16(월, KST 11-17) 11-24                        11-17
   * carol    KST     11-22(일 23:30)    11-23                          -
   * hana     KST     11-19(00:00 정각)  -                              -
   * dave     KST     11-23(월 00:30)    11-24, 11-25                   11-25
   * 탈퇴자   KST     10-26(월)          -                              10-27, 11-02, 11-25
   * erin     KST     2026-01-01         11-20(수집 첫날), 11-21, 11-24, 11-25   11-25
   * frank    KST     2026-01-01         -                              10-26 23:59:59 (MAU 직전)
   * gina     KST     2026-01-01         -                              10-27 00:00 (MAU 첫날)
   * 노광고   KST     11-16 (운영자)     매일                            11-25  → 전부 제외
   * </pre>
   */
  @Test
  void computesCardsAndCohortsFromSeededData() {
    UUID alice = insertUser("alice", "Asia/Seoul", "2026-11-16T01:00:00Z", null);
    UUID bob = insertUser("bob", "America/Los_Angeles", "2026-11-17T07:30:00Z", null);
    UUID carol = insertUser("carol", "Asia/Seoul", "2026-11-22T14:30:00Z", null);
    insertUser("hana", "Asia/Seoul", "2026-11-18T15:00:00Z", null);
    UUID dave = insertUser("dave", "Asia/Seoul", "2026-11-22T15:30:00Z", null);
    UUID withdrawn = insertUser(null, "Asia/Seoul", "2026-10-26T03:00:00Z", "2026-11-10T00:00:00Z");
    UUID erin = insertUser("erin", "Asia/Seoul", "2026-01-01T00:00:00Z", null);
    UUID frank = insertUser("frank", "Asia/Seoul", "2026-01-01T00:00:00Z", null);
    UUID gina = insertUser("gina", "Asia/Seoul", "2026-01-01T00:00:00Z", null);
    UUID operator = insertUser("노광고", "Asia/Seoul", "2026-11-16T02:00:00Z", null);

    visit(erin, "2026-11-20");
    visit(erin, "2026-11-21");
    visit(erin, "2026-11-24");
    visit(erin, "2026-11-25");
    visit(alice, "2026-11-21");
    visit(alice, "2026-11-23");
    visit(alice, "2026-11-25");
    dailyActive.insertIfAbsent(alice, LocalDate.parse("2026-11-25"), ClientPlatform.WEB, NOW);
    visit(bob, "2026-11-24");
    visit(carol, "2026-11-23");
    visit(dave, "2026-11-24");
    visit(dave, "2026-11-25");
    for (int day = 20; day <= 25; day++) visit(operator, "2026-11-" + day);

    run(alice, "2026-11-17T07:00:00");
    run(alice, "2026-11-23T21:00:00");
    run(alice, "2026-11-24T23:59:59");
    run(bob, "2026-11-17T06:00:00");
    run(dave, "2026-11-25T06:00:00");
    run(withdrawn, "2026-10-27T07:00:00");
    run(withdrawn, "2026-11-02T07:00:00");
    run(withdrawn, "2026-11-25T07:00:00");
    run(erin, "2026-11-25T06:30:00");
    run(frank, "2026-10-26T23:59:59");
    run(gina, "2026-10-27T00:00:00");
    run(operator, "2026-11-25T05:00:00");

    RetentionMetricsResponse r =
        new RetentionMetricsService(metricsRepository).compute(EXCLUDED, NOW.toInstant());

    assertEquals("2026-11-25", r.referenceDate());
    assertEquals("2026-11-20", r.visitCollectionStartDate());
    assertEquals("2026-11-21", r.visitCompleteFromDate());
    // 현지 가입일 11-19~11-25: hana(11-19 00:00), carol(11-22), dave(11-23)
    assertEquals(3, r.newSignups7d());

    // 방문 기준: 오늘 erin·alice(웹+앱이어도 1명)·dave
    assertEquals(3, r.visits().dau());
    // 11-21(2) 11-22(0) 11-23(2) 11-24(3) → 4일 평균 1.75. 11-20은 수집 첫날이라 제외
    assertEquals(4, r.visits().avgDauDays());
    assertEquals(1.75, r.visits().avgDau7d(), 1e-9);
    assertEquals(5, r.visits().wau());
    assertEquals(5, r.visits().mau());

    // 달리기 기준: 오늘 dave·탈퇴자·erin
    assertEquals(3, r.runs().dau());
    // 11-18~11-24 중 11-23(alice), 11-24 23:59:59(alice) → 2/7
    assertEquals(7, r.runs().avgDauDays());
    assertEquals(2.0 / 7, r.runs().avgDau7d(), 1e-9);
    // 11-19~11-25: alice, dave, 탈퇴자, erin
    assertEquals(4, r.runs().wau());
    // 10-27~11-25: alice, bob, dave, 탈퇴자, erin, gina (frank는 10-26 23:59:59라 제외)
    assertEquals(6, r.runs().mau());

    List<Cohort> cohorts = r.cohorts();
    assertEquals(8, cohorts.size());

    Cohort w1123 = cohorts.get(0);
    assertEquals("2026-11-23", w1123.weekStart());
    assertEquals(1, w1123.size());
    assertEquals(new Cell(1, 1), w1123.visits().d1());
    assertEquals(new Cell(0, 0), w1123.visits().d7());
    assertEquals(new Cell(1, 0), w1123.runs().d1());

    Cohort w1116 = cohorts.get(1);
    assertEquals("2026-11-16", w1116.weekStart());
    // alice, bob(LA 현지 월요일), carol(일요일 23:30), hana — 운영자 제외
    assertEquals(4, w1116.size());
    // D1 방문: 수집 전(11-17, 11-20)인 alice·bob·hana는 분모에서 빠지고 carol(11-23)만 판정
    assertEquals(new Cell(1, 1), w1116.visits().d1());
    // D7 방문: alice(11-23 방문 ○), bob(11-23 — LA 현지 오늘 11-24라 판정 가능, 방문 ×)
    assertEquals(new Cell(2, 1), w1116.visits().d7());
    assertEquals(new Cell(0, 0), w1116.visits().d30());
    // D1 달리기: alice ○, bob ○(현지 11-17), carol ×(11-23), hana ×(11-20)
    assertEquals(new Cell(4, 2), w1116.runs().d1());
    // D7 달리기: alice ○(11-23 21:00), bob ×
    assertEquals(new Cell(2, 1), w1116.runs().d7());
    assertEquals(new Cell(0, 0), w1116.runs().d30());

    assertEquals(0, cohorts.get(2).size());
    assertEquals(0, cohorts.get(3).size());

    Cohort w1026 = cohorts.get(4);
    assertEquals("2026-10-26", w1026.weekStart());
    // 탈퇴 회원도 코호트에 남는다(방문 기록은 탈퇴 때 지워져 방문 기준은 수집 전으로 판정 불가)
    assertEquals(1, w1026.size());
    assertEquals(new Cell(0, 0), w1026.visits().d1());
    assertEquals(new Cell(1, 1), w1026.runs().d1());
    assertEquals(new Cell(1, 1), w1026.runs().d7());
    // D30 = 11-25 = 현지 오늘 → 아직 판정하지 않는다
    assertEquals(new Cell(0, 0), w1026.runs().d30());

    assertEquals("2026-10-05", cohorts.get(7).weekStart());
  }

  /**
   * 수집 시작은 가장 이른 local_date가 아니라 첫 핑을 받은 시각으로 정한다. 배포 직후 LA 사용자의
   * 핑은 현지 날짜가 KST보다 하루 이르지만(11-19), 그 날을 수집 시작으로 삼으면 KST 사용자에게
   * 아직 부분 수집인 11-20이 완결된 날로 잡힌다.
   */
  @Test
  void collectionStartComesFromFirstPingInstantNotEarliestLocalDate() {
    UUID la = insertUser("la", "America/Los_Angeles", "2026-01-01T00:00:00Z", null);
    UUID seoul = insertUser("seoul", "Asia/Seoul", "2026-01-01T00:00:00Z", null);
    OffsetDateTime deployedAt = OffsetDateTime.parse("2026-11-20T03:00:00Z"); // 11-20 12:00 KST
    visit(la, LocalDate.parse("2026-11-19"), deployedAt); // LA 현지 11-19 19:00
    visit(seoul, LocalDate.parse("2026-11-20"), deployedAt);

    RetentionMetricsResponse r =
        new RetentionMetricsService(metricsRepository).compute(EXCLUDED, NOW.toInstant());

    assertEquals("2026-11-20", r.visitCollectionStartDate());
    assertEquals("2026-11-21", r.visitCompleteFromDate());
    // 11-20은 부분 수집이라 빼고 11-21~11-24 4일 평균
    assertEquals(4, r.visits().avgDauDays());
    assertEquals(0.0, r.visits().avgDau7d(), 1e-9);
  }

  /** 운영자의 배포 전 확인 핑이 수집 시작을 앞당기면 그 사이 날짜가 0으로 평균·분모에 들어간다. */
  @Test
  void operatorPingsDoNotMoveCollectionStartEarlier() {
    UUID operator = insertUser("노광고", "Asia/Seoul", "2026-01-01T00:00:00Z", null);
    UUID runner = insertUser("runner", "Asia/Seoul", "2026-01-01T00:00:00Z", null);
    visit(operator, "2026-11-18");
    visit(runner, "2026-11-20");

    RetentionMetricsResponse r =
        new RetentionMetricsService(metricsRepository).compute(EXCLUDED, NOW.toInstant());

    assertEquals("2026-11-20", r.visitCollectionStartDate());
    assertEquals("2026-11-21", r.visitCompleteFromDate());
    assertEquals(4, r.visits().avgDauDays());
  }

  @Test
  void emptyDatabaseProducesZerosAndNoVisitCollection() {
    RetentionMetricsResponse r =
        new RetentionMetricsService(metricsRepository).compute(EXCLUDED, NOW.toInstant());

    assertNull(r.visitCollectionStartDate());
    assertNull(r.visits().avgDau7d());
    assertEquals(0, r.visits().dau());
    assertEquals(0.0, r.runs().avgDau7d(), 1e-9);
    assertEquals(0, r.newSignups7d());
    assertEquals(8, r.cohorts().size());
  }

  // ── 시드 헬퍼 ────────────────────────────────────────────────────

  private UUID insertUser(String displayName, String timeZone, String createdAt, String withdrawnAt) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "insert into users (id, firebase_uid, display_name, time_zone, created_at, withdrawn_at, "
            + "row_version) values (?, ?, ?, ?, ?, ?, 0)",
        id,
        "uid-" + id,
        displayName,
        timeZone,
        OffsetDateTime.parse(createdAt),
        withdrawnAt == null ? null : OffsetDateTime.parse(withdrawnAt));
    return id;
  }

  /** 그 날 12:00 KST에 첫 핑을 받은 것으로 넣는다(수집 시작 시각 판정이 created_at을 본다). */
  private void visit(UUID userId, String localDate) {
    LocalDate day = LocalDate.parse(localDate);
    visit(userId, day, day.atTime(12, 0).atOffset(java.time.ZoneOffset.ofHours(9)));
  }

  private void visit(UUID userId, LocalDate localDate, OffsetDateTime receivedAt) {
    dailyActive.insertIfAbsent(userId, localDate, ClientPlatform.ANDROID_APP, receivedAt);
  }

  /** started_at(UTC)은 집계에 쓰지 않으므로 KST로 환산해 넣는다. */
  private void run(UUID userId, String startedAtLocal) {
    LocalDateTime local = LocalDateTime.parse(startedAtLocal);
    OffsetDateTime startedAt = local.atOffset(java.time.ZoneOffset.ofHours(9));
    jdbc.update(
        "insert into workout_session (user_id, started_at, ended_at, duration_sec, distance_m, "
            + "calories, path_json, started_at_local) values (?, ?, ?, 1800, 5000, 300, '[]'::jsonb, ?)",
        userId, startedAt, startedAt.plusMinutes(30), local);
  }

  private long count(String sql) {
    Long value = jdbc.queryForObject(sql, Long.class);
    return value == null ? 0 : value;
  }
}
