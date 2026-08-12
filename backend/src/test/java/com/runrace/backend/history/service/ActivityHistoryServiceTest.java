package com.runrace.backend.history.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.verify;

import com.runrace.backend.history.domain.ActivityAction;
import com.runrace.backend.history.domain.ActivityTargetType;
import com.runrace.backend.history.domain.UserActivityHistory;
import com.runrace.backend.history.repository.UserActivityHistoryRepository;
import java.util.Map;
import java.util.UUID;
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
}
