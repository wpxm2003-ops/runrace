package com.runrace.backend.workout.service;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.service.ChallengeProgressService;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.event.WorkoutEvents;
import com.runrace.backend.history.domain.ActivityAction;
import com.runrace.backend.history.domain.ActivityTargetType;
import com.runrace.backend.history.service.ActivityHistoryService;
import com.runrace.backend.upload.ImageUploadService;
import com.runrace.backend.workout.domain.WorkoutSession;
import com.runrace.backend.workout.repository.PersonalBestRepository;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 저장된 운동의 메모·이미지 수정과 삭제를 전담한다. */
@Service
@RequiredArgsConstructor
public class WorkoutMutationService {
  private static final int MAX_MEMO_LENGTH = 500;

  private final WorkoutSessionRepository workoutSessionRepository;
  private final ImageUploadService imageUploadService;
  private final PersonalBestRepository personalBestRepository;
  private final ChallengeProgressService challengeProgressService;
  private final ApplicationEventPublisher eventPublisher;
  private final ActivityHistoryService activityHistoryService;

  @Transactional
  public void updateMemo(AuthPrincipal principal, Long id, String memo) {
    if (memo != null && memo.length() > MAX_MEMO_LENGTH) {
      throw ApiException.badRequest("memo_too_long");
    }
    WorkoutSession session = workoutSessionRepository.getRequiredForUser(id, principal.userId());
    session.updateMemo(memo == null || memo.isBlank() ? null : memo.strip());
    workoutSessionRepository.save(session);
  }

  @Transactional
  public void updateImage(AuthPrincipal principal, Long id, String imageUrl) {
    String normalized = imageUrl == null || imageUrl.isBlank() ? null : imageUrl.strip();
    if (normalized != null && !imageUploadService.isStoredUrl(normalized)) {
      throw ApiException.badRequest("invalid_image_url");
    }
    WorkoutSession session = workoutSessionRepository.getRequiredForUser(id, principal.userId());
    String previous = session.getImageUrl();
    session.updateImage(normalized);
    workoutSessionRepository.save(session);
    if (previous != null && !previous.isBlank() && !previous.equals(normalized)) {
      eventPublisher.publishEvent(new WorkoutEvents.WorkoutImageDeletedEvent(previous));
    }
  }

  @Transactional
  public void deleteForUser(AuthPrincipal principal, Long id) {
    WorkoutSession session = workoutSessionRepository.getRequiredForUser(id, principal.userId());
    challengeProgressService.reverseWorkoutDistance(session.getId());
    personalBestRepository.deleteAll(personalBestRepository.findAllByWorkoutId(session.getId()));
    String imageUrl = session.getImageUrl();
    workoutSessionRepository.delete(session);
    activityHistoryService.recordSelf(
        principal.userId(),
        ActivityAction.WORKOUT_DELETED,
        ActivityTargetType.WORKOUT,
        session.getId(),
        Map.of(
            "distanceM", session.getDistanceM(),
            "workoutType", session.getWorkoutType().name()));
    if (imageUrl != null && !imageUrl.isBlank()) {
      eventPublisher.publishEvent(new WorkoutEvents.WorkoutImageDeletedEvent(imageUrl));
    }
  }
}
