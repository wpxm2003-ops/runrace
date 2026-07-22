package com.runrace.backend.challenge.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.challenge.repository.ChallengeRepository;
import com.runrace.backend.challenge.service.ChallengeScheduler.OnrampWindow;
import com.runrace.backend.observability.service.ErrorLogService;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** 온램프 공개 레이스 회차 계산 — 요일 엇갈리기가 "항상 모집 중인 레이스"를 보장하는지 검증. */
@ExtendWith(MockitoExtension.class)
class ChallengeSchedulerTest {

  @Mock ChallengeRepository challengeRepository;
  @Mock ChallengeService challengeService;
  @Mock ErrorLogService errorLogService;

  @InjectMocks ChallengeScheduler scheduler;

  // 2026-07-20(월) ~ 2026-07-26(일) 한 주를 기준으로 검증한다.
  private static final LocalDate MON = LocalDate.of(2026, 7, 20);
  private static final LocalDate TUE = MON.plusDays(1);
  private static final LocalDate WED = MON.plusDays(2);
  private static final LocalDate THU = MON.plusDays(3);
  private static final LocalDate FRI = MON.plusDays(4);
  private static final LocalDate SAT = MON.plusDays(5);
  private static final LocalDate SUN = MON.plusDays(6);

  @Nested class 평일에_실행하면_주말회차 {

    @Test void 월요일이면_이번주_토일_회차() {
      OnrampWindow w = ChallengeScheduler.nextOnrampWindow(MON);
      assertEquals(SAT, w.startDay());
      assertEquals(SUN, w.endDay());
      assertEquals("주말", w.label());
      assertEquals(BigDecimal.valueOf(10), w.goalKm());
    }

    @Test void 금요일이면_바로_다음날_토요일_시작() {
      OnrampWindow w = ChallengeScheduler.nextOnrampWindow(FRI);
      assertEquals(SAT, w.startDay());
      assertEquals(SUN, w.endDay());
      assertEquals("주말", w.label());
    }

    @Test void 화수목_모두_같은_주말회차를_가리킨다() {
      for (LocalDate d : new LocalDate[] {TUE, WED, THU}) {
        OnrampWindow w = ChallengeScheduler.nextOnrampWindow(d);
        assertEquals(SAT, w.startDay(), "기준일=" + d);
        assertEquals(SUN, w.endDay(), "기준일=" + d);
      }
    }
  }

  @Nested class 주말에_실행하면_평일회차 {

    @Test void 토요일이면_다음주_월금_회차() {
      OnrampWindow w = ChallengeScheduler.nextOnrampWindow(SAT);
      assertEquals(MON.plusDays(7), w.startDay()); // 다음 주 월요일
      assertEquals(MON.plusDays(11), w.endDay()); // 그 주 금요일
      assertEquals("평일", w.label());
      assertEquals(BigDecimal.valueOf(30), w.goalKm());
    }

    @Test void 일요일이면_바로_다음날_월요일_시작() {
      OnrampWindow w = ChallengeScheduler.nextOnrampWindow(SUN);
      assertEquals(MON.plusDays(7), w.startDay());
      assertEquals(MON.plusDays(11), w.endDay());
      assertEquals("평일", w.label());
    }

    @Test void 평일회차는_월요일에_시작해_금요일에_끝난다() {
      OnrampWindow w = ChallengeScheduler.nextOnrampWindow(SAT);
      assertEquals(DayOfWeek.MONDAY, w.startDay().getDayOfWeek());
      assertEquals(DayOfWeek.FRIDAY, w.endDay().getDayOfWeek());
    }
  }

  @Nested class 제목 {

    @Test void 시작일을_start_표기로_드러낸다() {
      assertEquals("주말 아무나 레이스 7/25 start!!", ChallengeScheduler.nextOnrampWindow(MON).title());
      assertEquals("평일 아무나 레이스 7/27 start!!", ChallengeScheduler.nextOnrampWindow(SAT).title());
    }

    @Test void 모든_요일에서_제목이_50바이트_이내() {
      // ChallengeService.TITLE_MAX_BYTES=50(UTF-8 바이트). 초과하면 생성이 조용히 실패한다.
      for (int i = 0; i < 7; i++) {
        String title = ChallengeScheduler.nextOnrampWindow(MON.plusDays(i)).title();
        int bytes = title.getBytes(StandardCharsets.UTF_8).length;
        assertTrue(bytes <= 50, "제목=" + title + " (" + bytes + "바이트)");
      }
    }

    @Test void 제목에_금지문자가_없다() {
      // ForbiddenTextChars: " ' ; \ ` < > 및 제어문자. 포함되면 invalid_title_chars로 실패한다.
      for (int i = 0; i < 7; i++) {
        String title = ChallengeScheduler.nextOnrampWindow(MON.plusDays(i)).title();
        assertFalse(title.matches(".*[\"';\\\\`<>].*"), "제목=" + title);
      }
    }

    @Test void 두자리_월일도_형식이_유지된다() {
      LocalDate decMon = LocalDate.of(2026, 12, 7); // 월요일 → 12/12(토) 시작
      assertEquals("주말 아무나 레이스 12/12 start!!", ChallengeScheduler.nextOnrampWindow(decMon).title());
    }
  }

  @Nested class 모든_요일_불변식 {

    @Test void 시작일은_항상_미래여야_한다() {
      // RaceRules.validateWindow가 과거 시작을 막으므로, 어느 요일에 돌아도 미래여야 생성이 성공한다.
      for (int i = 0; i < 7; i++) {
        LocalDate today = MON.plusDays(i);
        OnrampWindow w = ChallengeScheduler.nextOnrampWindow(today);
        assertTrue(w.startDay().isAfter(today), "기준일=" + today + " 시작일=" + w.startDay());
      }
    }

    @Test void 종료일은_항상_시작일_이후이고_31일_이내() {
      for (int i = 0; i < 7; i++) {
        OnrampWindow w = ChallengeScheduler.nextOnrampWindow(MON.plusDays(i));
        assertTrue(w.endDay().isAfter(w.startDay()));
        assertTrue(w.endDay().isBefore(w.startDay().plusDays(31)));
      }
    }

    @Test void 회차는_주말_평일_두_종류뿐이다() {
      for (int i = 0; i < 7; i++) {
        OnrampWindow w = ChallengeScheduler.nextOnrampWindow(MON.plusDays(i));
        assertTrue(w.label().equals("주말") || w.label().equals("평일"));
      }
    }
  }

  // ── sweepRaceLifecycle ───────────────────────────────────────────

  @Nested class SweepRaceLifecycle {
    @Test void 대상없으면_아무것도안함() {
      when(challengeRepository.findStartedNotEndedIds(any())).thenReturn(List.of());

      scheduler.sweepRaceLifecycle();

      verify(challengeService, never()).processRaceLifecycle(any(), any());
    }

    @Test void 대상마다_독립처리() {
      when(challengeRepository.findStartedNotEndedIds(any())).thenReturn(List.of(1L, 2L));

      scheduler.sweepRaceLifecycle();

      verify(challengeService).processRaceLifecycle(eq(1L), any());
      verify(challengeService).processRaceLifecycle(eq(2L), any());
    }

    @Test void 한건_예외나도_나머지는_계속처리되고_에러로그남음() {
      when(challengeRepository.findStartedNotEndedIds(any())).thenReturn(List.of(1L, 2L));
      doThrow(new RuntimeException("boom")).when(challengeService).processRaceLifecycle(eq(1L), any());

      assertDoesNotThrow(() -> scheduler.sweepRaceLifecycle());

      verify(challengeService).processRaceLifecycle(eq(2L), any());
      verify(errorLogService).recordServiceError(
          eq("scheduler"), eq("RuntimeException"), eq("boom"), any(), eq("challengeId=1"));
    }
  }

  // ── ensureOpenPublicRace ─────────────────────────────────────────

  @Nested class EnsureOpenPublicRace {
    @Test void 이미모집중인공개레이스있으면_생성안함() {
      when(challengeRepository.existsOpenPublicRace(any())).thenReturn(true);

      scheduler.ensureOpenPublicRace();

      verify(challengeService, never()).createOfficialRace(any(), any(), any(), anyInt(), any(), any());
    }

    @Test void 없으면_운영자계정으로_새회차생성() {
      when(challengeRepository.existsOpenPublicRace(any())).thenReturn(false);

      scheduler.ensureOpenPublicRace();

      verify(challengeService).createOfficialRace(
          eq(UUID.fromString("662963bb-41f8-4180-92de-ecf02a8b3ba7")),
          any(), any(), eq(50), any(), any());
    }

    @Test void 생성중_예외나면_에러로그기록하고_전파안함() {
      when(challengeRepository.existsOpenPublicRace(any())).thenReturn(false);
      when(challengeService.createOfficialRace(any(), any(), any(), anyInt(), any(), any()))
          .thenThrow(new RuntimeException("fail"));

      assertDoesNotThrow(() -> scheduler.ensureOpenPublicRace());

      verify(errorLogService).recordServiceError(
          eq("scheduler"), eq("RuntimeException"), eq("fail"), any(), eq("ensureOpenPublicRace"));
    }
  }
}
