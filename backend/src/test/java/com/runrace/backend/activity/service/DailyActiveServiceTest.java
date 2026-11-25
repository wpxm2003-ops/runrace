package com.runrace.backend.activity.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.runrace.backend.activity.domain.ClientPlatform;
import com.runrace.backend.activity.repository.UserDailyActiveRepository;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class DailyActiveServiceTest {

  @Mock AppUserRepository appUserRepository;
  @Mock UserDailyActiveRepository userDailyActiveRepository;

  @InjectMocks DailyActiveService service;

  private final UUID userId = UUID.randomUUID();

  private void userWithTimeZone(String timeZone) {
    AppUser user = AppUser.builder().id(userId).timeZone(timeZone).build();
    when(appUserRepository.getRequired(userId)).thenReturn(user);
  }

  /** 같은 순간이라도 사용자 시간대에 따라 현지 날짜가 달라진다. 경계는 각 시간대의 자정이다. */
  @ParameterizedTest(name = "{1} @ {0} -> {2}")
  @CsvSource({
      // KST 자정 직전/직후
      "2026-11-24T14:59:59Z, Asia/Seoul,          2026-11-24",
      "2026-11-24T15:00:00Z, Asia/Seoul,          2026-11-25",
      // 같은 순간, 서쪽 시간대는 아직 전날
      "2026-11-25T03:00:00Z, America/Los_Angeles, 2026-11-24",
      "2026-11-25T08:00:00Z, America/Los_Angeles, 2026-11-25",
      // UTC 자정 경계
      "2026-11-24T23:59:59Z, UTC,                 2026-11-24",
      "2026-11-25T00:00:00Z, UTC,                 2026-11-25",
      // 날짜변경선 동쪽 끝(UTC+14)
      "2026-11-24T10:00:00Z, Pacific/Kiritimati,  2026-11-25",
      // 비었거나 잘못된 시간대는 Asia/Seoul
      "2026-11-24T15:00:00Z, '',                  2026-11-25",
      "2026-11-24T15:00:00Z, Not/AZone,           2026-11-25",
  })
  void recordsTheUsersLocalDate(String now, String timeZone, String expected) {
    userWithTimeZone(timeZone);
    when(userDailyActiveRepository.insertIfAbsent(any(), any(), any(), any())).thenReturn(true);

    var result = service.recordPing(userId, "android_app", Instant.parse(now));

    assertEquals(LocalDate.parse(expected), result.localDate());
    verify(userDailyActiveRepository).insertIfAbsent(
        eq(userId),
        eq(LocalDate.parse(expected)),
        eq(ClientPlatform.ANDROID_APP),
        eq(OffsetDateTime.ofInstant(Instant.parse(now), ZoneOffset.UTC)));
  }

  /** 같은 날 두 번째 핑은 DB가 무시하고, 서비스는 recorded=false로 알려 준다. */
  @Test
  void reportsDuplicatePingAsNotRecorded() {
    userWithTimeZone("Asia/Seoul");
    when(userDailyActiveRepository.insertIfAbsent(any(), any(), any(), any()))
        .thenReturn(true, false);
    Instant now = Instant.parse("2026-11-25T01:00:00Z");

    assertTrue(service.recordPing(userId, "web", now).recorded());
    assertFalse(service.recordPing(userId, "web", now.plusSeconds(60)).recorded());
  }

  @Test
  void acceptsEveryKnownPlatform() {
    userWithTimeZone("Asia/Seoul");
    when(userDailyActiveRepository.insertIfAbsent(any(), any(), any(), any())).thenReturn(true);
    Instant now = Instant.parse("2026-11-25T01:00:00Z");

    service.recordPing(userId, "android_app", now);
    service.recordPing(userId, "web", now);
    service.recordPing(userId, "ios_web", now);

    verify(userDailyActiveRepository).insertIfAbsent(any(), any(), eq(ClientPlatform.ANDROID_APP), any());
    verify(userDailyActiveRepository).insertIfAbsent(any(), any(), eq(ClientPlatform.WEB), any());
    verify(userDailyActiveRepository).insertIfAbsent(any(), any(), eq(ClientPlatform.IOS_WEB), any());
  }

  /** 모르는 값은 400 — 임의 문자열이 집계 테이블에 쌓이면 안 된다. 사용자 조회도 하지 않는다. */
  @ParameterizedTest
  @CsvSource(value = {"ios_app", "ANDROID_APP", "''", "NULL"}, nullValues = "NULL")
  void rejectsUnknownPlatform(String platform) {
    ApiException e = assertThrows(ApiException.class,
        () -> service.recordPing(userId, platform, Instant.parse("2026-11-25T01:00:00Z")));

    assertEquals("invalid_platform", e.code());
    verifyNoInteractions(appUserRepository, userDailyActiveRepository);
  }
}
