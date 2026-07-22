package com.runrace.backend.crew.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.crew.repository.CrewMatchRepository;
import com.runrace.backend.observability.service.ErrorLogService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class CrewMatchSchedulerTest {

  @Mock CrewMatchRepository crewMatchRepository;
  @Mock CrewMatchService crewMatchService;
  @Mock ErrorLogService errorLogService;

  @InjectMocks CrewMatchScheduler scheduler;

  @Test void 대상없으면_아무것도안함() {
    when(crewMatchRepository.findAcceptedNotEndedIds(any())).thenReturn(List.of());

    scheduler.sweepEndedMatches();

    verify(crewMatchService, never()).finalizeIfTimeEnded(anyLong(), any());
  }

  @Test void 대상마다_독립처리() {
    when(crewMatchRepository.findAcceptedNotEndedIds(any())).thenReturn(List.of(1L, 2L));

    scheduler.sweepEndedMatches();

    verify(crewMatchService).finalizeIfTimeEnded(eq(1L), any());
    verify(crewMatchService).finalizeIfTimeEnded(eq(2L), any());
  }

  @Test void 한건_예외나도_나머지는_계속처리되고_에러로그남음() {
    when(crewMatchRepository.findAcceptedNotEndedIds(any())).thenReturn(List.of(1L, 2L));
    doThrow(new RuntimeException("boom")).when(crewMatchService).finalizeIfTimeEnded(eq(1L), any());

    assertDoesNotThrow(() -> scheduler.sweepEndedMatches());

    verify(crewMatchService).finalizeIfTimeEnded(eq(2L), any());
    verify(errorLogService).recordServiceError(
        eq("scheduler"), eq("RuntimeException"), eq("boom"), any(), eq("crewMatchId=1"));
  }
}
