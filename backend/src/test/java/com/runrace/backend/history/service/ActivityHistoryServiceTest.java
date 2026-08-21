package com.runrace.backend.history.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.history.domain.ActivityAction;
import com.runrace.backend.history.domain.ActivityTargetType;
import com.runrace.backend.history.domain.UserActivityHistory;
import com.runrace.backend.history.repository.UserActivityHistoryRepository;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ActivityHistoryServiceTest {
  @Mock UserActivityHistoryRepository repository;
  @InjectMocks ActivityHistoryService service;

  @Test
  void actorSubjectTargetAndSafeMetadataAreStored() {
    UUID leaderId = UUID.randomUUID();
    UUID memberId = UUID.randomUUID();

    service.record(
        leaderId,
        memberId,
        ActivityAction.CREW_MEMBER_REMOVED,
        ActivityTargetType.CREW,
        42L,
        Map.of("source", "leader_action"));

    ArgumentCaptor<UserActivityHistory> captor =
        ArgumentCaptor.forClass(UserActivityHistory.class);
    verify(repository).save(captor.capture());
    UserActivityHistory history = captor.getValue();
    assertEquals(leaderId, history.getActorUserId());
    assertEquals(memberId, history.getSubjectUserId());
    assertEquals(ActivityAction.CREW_MEMBER_REMOVED, history.getActionType());
    assertEquals(ActivityTargetType.CREW, history.getTargetType());
    assertEquals("42", history.getTargetId());
    assertEquals(Map.of("source", "leader_action"), history.getMetadata());
    assertNotNull(history.getOccurredAt());
  }

  /**
   * 시간 창 중복 억제. 대상 엔티티가 없어 멱등 키를 만들 수 없는 행위(운동 시작)를 위한
   * 것이라, 창 안에 같은 행위가 있으면 아무것도 쓰지 않아야 한다.
   */
  @Nested
  class RecordSelfOnce {

    private final UUID userId = UUID.randomUUID();

    private boolean call() {
      return service.recordSelfOnce(
          userId,
          ActivityAction.WORKOUT_STARTED,
          ActivityTargetType.USER,
          userId,
          Duration.ofMinutes(1));
    }

    @Test
    void writesWhenNothingRecent() {
      when(repository.existsByActorUserIdAndActionTypeAndOccurredAtAfter(any(), any(), any()))
          .thenReturn(false);

      assertTrue(call());

      verify(repository).save(any(UserActivityHistory.class));
    }

    @Test
    void skipsWhenSameActionIsRecent() {
      when(repository.existsByActorUserIdAndActionTypeAndOccurredAtAfter(any(), any(), any()))
          .thenReturn(true);

      assertFalse(call());

      verify(repository, never()).save(any());
    }

    /** 창은 호출 시점 기준으로 뒤로 계산돼야 한다 — 앞으로 계산하면 아무것도 안 걸린다. */
    @Test
    void windowIsMeasuredBackwardFromNow() {
      when(repository.existsByActorUserIdAndActionTypeAndOccurredAtAfter(any(), any(), any()))
          .thenReturn(false);
      OffsetDateTime before = OffsetDateTime.now();

      call();

      ArgumentCaptor<OffsetDateTime> since = ArgumentCaptor.forClass(OffsetDateTime.class);
      verify(repository).existsByActorUserIdAndActionTypeAndOccurredAtAfter(
          eq(userId), eq(ActivityAction.WORKOUT_STARTED), since.capture());
      assertTrue(since.getValue().isBefore(before));
      assertTrue(since.getValue().isAfter(before.minusMinutes(2)));
    }

    /** 중복 판정은 사용자 + 행위 조합으로만 한다 — 다른 행위까지 함께 막으면 안 된다. */
    @Test
    void deduplicationIsScopedToUserAndAction() {
      when(repository.existsByActorUserIdAndActionTypeAndOccurredAtAfter(any(), any(), any()))
          .thenReturn(false);

      call();

      verify(repository).existsByActorUserIdAndActionTypeAndOccurredAtAfter(
          eq(userId), eq(ActivityAction.WORKOUT_STARTED), any());
    }
  }
}
