package com.runrace.backend.notification;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.challenge.repository.ChallengeMemberRepository;
import com.runrace.backend.challenge.repository.ChallengeMemberRepositoryCustom.SharedRaceParticipant;
import com.runrace.backend.event.WorkoutEvents;
import com.runrace.backend.push.repository.SystemPushHistoryRepository;
import com.runrace.backend.push.service.PushService;
import com.runrace.backend.rival.repository.RivalRepository;
import com.runrace.backend.upload.ImageUploadService;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class WorkoutNotificationsTest {

  @Mock PushService pushService;
  @Mock ImageUploadService imageUploadService;
  @Mock RivalRepository rivalRepository;
  @Mock ChallengeMemberRepository challengeMemberRepository;
  @Mock SystemPushHistoryRepository systemPushHistoryRepository;

  @InjectMocks WorkoutNotifications notifications;

  private final UUID runnerId = UUID.randomUUID();
  private final UUID recipientId = UUID.randomUUID();

  @Test
  void sharedRaceParticipantGetsRaceNotificationInsteadOfRivalNotification() {
    when(rivalRepository.findUserIdsWhoHaveMeAsRival(runnerId)).thenReturn(List.of(recipientId));
    when(challengeMemberRepository.findSharedActiveRaceParticipants(eq(runnerId), any()))
        .thenReturn(List.of(new SharedRaceParticipant(recipientId, 42L)));
    when(systemPushHistoryRepository.countByUserIdAndPushTypeAndSentAtAfter(
        eq(recipientId), eq("race_workout"), any(OffsetDateTime.class))).thenReturn(0L);

    notifications.onWorkoutSaved(new WorkoutEvents.WorkoutSavedEvent(runnerId, "민수", 5100));

    verify(pushService).sendLocalized(recipientId, "race.workout.title", "race.workout.body",
        "민수", "5.1", "/challenges/42", "race_workout");
    verify(pushService, never()).sendLocalized(eq(recipientId), eq("rival.workout.title"),
        any(), any(), any(), any(), any());
  }

  @Test
  void thirdRaceNotificationUsesLastNotificationMessage() {
    when(rivalRepository.findUserIdsWhoHaveMeAsRival(runnerId)).thenReturn(List.of());
    when(challengeMemberRepository.findSharedActiveRaceParticipants(eq(runnerId), any()))
        .thenReturn(List.of(new SharedRaceParticipant(recipientId, 7L)));
    when(systemPushHistoryRepository.countByUserIdAndPushTypeAndSentAtAfter(
        eq(recipientId), eq("race_workout"), any(OffsetDateTime.class))).thenReturn(2L);

    notifications.onWorkoutSaved(new WorkoutEvents.WorkoutSavedEvent(runnerId, "민수", 3000));

    verify(pushService).sendLocalized(recipientId, "race.workout.title", "race.workout.last",
        "민수", "3.0", "/challenges/7", "race_workout");
  }

  @Test
  void noRaceOrRivalNotificationAfterDailyLimit() {
    when(rivalRepository.findUserIdsWhoHaveMeAsRival(runnerId)).thenReturn(List.of(recipientId));
    when(challengeMemberRepository.findSharedActiveRaceParticipants(eq(runnerId), any()))
        .thenReturn(List.of(new SharedRaceParticipant(recipientId, 7L)));
    when(systemPushHistoryRepository.countByUserIdAndPushTypeAndSentAtAfter(
        eq(recipientId), eq("race_workout"), any(OffsetDateTime.class))).thenReturn(3L);

    notifications.onWorkoutSaved(new WorkoutEvents.WorkoutSavedEvent(runnerId, "민수", 3000));

    verify(pushService, never()).sendLocalized(any(), any(), any(), any(), any(), any(), any());
  }
}
