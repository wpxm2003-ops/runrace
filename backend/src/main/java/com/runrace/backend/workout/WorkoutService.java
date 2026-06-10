package com.runrace.backend.workout;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.ApprovalStatus;
import com.runrace.backend.challenge.ChallengeProgressService;
import com.runrace.backend.challenge.IndoorApprovalService;
import com.runrace.backend.challenge.ChallengeWorkout;
import com.runrace.backend.challenge.ChallengeWorkoutRepository;
import com.runrace.backend.challenge.IndoorRunApproval;
import com.runrace.backend.challenge.IndoorRunApprovalRepository;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.user.AppUser;
import com.runrace.backend.user.AppUserRepository;
import com.runrace.backend.workout.dto.WorkoutSummaryResponse;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class WorkoutService {
  private final WorkoutSessionRepository workoutSessionRepository;
  private final AppUserRepository appUserRepository;
  private final ChallengeProgressService challengeProgressService;
  private final IndoorApprovalService indoorApprovalService;
  private final ChallengeWorkoutRepository challengeWorkoutRepository;
  private final IndoorRunApprovalRepository indoorRunApprovalRepository;
  private final ApplicationEventPublisher eventPublisher;
  private final ObjectMapper objectMapper;

  @Transactional
  public WorkoutSession create(
      AuthPrincipal principal,
      OffsetDateTime startedAt,
      OffsetDateTime endedAt,
      int durationSec,
      int distanceM,
      int calories,
      Integer avgPaceSecPerKm,
      List<PathPoint> path
  ) {
    if (durationSec < 1) {
      throw ApiException.badRequest("duration_too_short");
    }
    if (path == null || path.isEmpty()) {
      throw ApiException.badRequest("path_empty");
    }

    AppUser user = appUserRepository.getRequired(principal.userId());
    WorkoutSession saved = workoutSessionRepository.save(WorkoutSession.builder()
        .user(user)
        .startedAt(startedAt)
        .endedAt(endedAt)
        .durationSec(durationSec)
        .distanceM(distanceM)
        .calories(calories)
        .avgPaceSecPerKm(avgPaceSecPerKm)
        .pathJson(toJson(path))
        .createdAt(OffsetDateTime.now())
        .build());

    // 현재 참여 중인 진행 대결에 운동 거리 반영
    challengeProgressService.applyWorkoutDistance(principal.userId(), saved.getId(), distanceM);

    return saved;
  }

  @Transactional
  public WorkoutSession createIndoor(
      AuthPrincipal principal,
      int distanceM,
      int durationSec,
      String startedAt,
      String imageUrl) {
    if (durationSec < 1) throw ApiException.badRequest("duration_too_short");
    if (distanceM <= 0) throw ApiException.badRequest("distance_invalid");

    AppUser user = appUserRepository.getRequired(principal.userId());
    OffsetDateTime start = OffsetDateTime.parse(startedAt);
    OffsetDateTime end = start.plusSeconds(durationSec);

    int calories = Math.max(1, Math.round(distanceM / 1000f * 65));
    Integer avgPaceSecPerKm = distanceM >= 10
        ? (int) Math.round(durationSec / (distanceM / 1000.0)) : null;

    WorkoutSession saved = workoutSessionRepository.save(WorkoutSession.builder()
        .user(user)
        .workoutType(WorkoutType.INDOOR)
        .startedAt(start)
        .endedAt(end)
        .durationSec(durationSec)
        .distanceM(distanceM)
        .calories(calories)
        .avgPaceSecPerKm(avgPaceSecPerKm)
        .imageUrl(imageUrl)
        .pathJson("[]")
        .createdAt(OffsetDateTime.now())
        .build());

    indoorApprovalService.createPendingIndoorApprovals(principal.userId(), saved, distanceM);
    return saved;
  }

  @Transactional
  public void voteIndoorRun(AuthPrincipal principal, Long workoutId, boolean approved) {
    List<ChallengeWorkout> pending = challengeWorkoutRepository
        .findAllByWorkoutSessionId(workoutId)
        .stream()
        .filter(cw -> cw.getApprovalStatus() == ApprovalStatus.PENDING)
        .toList();

    if (pending.isEmpty()) throw ApiException.notFound("no_pending_approval");

    boolean voted = false;
    for (ChallengeWorkout cw : pending) {
      var myVoteOpt = indoorRunApprovalRepository
          .findByChallengeWorkoutIdAndVoterId(cw.getId(), principal.userId());
      if (myVoteOpt.isEmpty()) continue;

      IndoorRunApproval myVote = myVoteOpt.get();
      if (myVote.getApproved() != null) throw ApiException.badRequest("already_voted");

      myVote.castVote(approved);
      indoorRunApprovalRepository.save(myVote);
      voted = true;

      if (!approved) {
        cw.reject();
        challengeWorkoutRepository.save(cw);
      } else {
        List<IndoorRunApproval> all = indoorRunApprovalRepository
            .findAllByChallengeWorkoutId(cw.getId());
        boolean allApproved = all.stream().allMatch(a -> Boolean.TRUE.equals(a.getApproved()));
        if (allApproved) {
          indoorApprovalService.applyApprovedIndoorRun(cw.getId());
        }
      }
    }
    if (!voted) throw ApiException.forbidden("not_a_voter");
  }

  @Transactional(readOnly = true)
  public WorkoutSession getForUser(UUID userId, Long id) {
    return workoutSessionRepository
        .findByIdAndUserId(id, userId)
        .orElseThrow(() -> ApiException.notFound("workout_not_found"));
  }

  /** 공개 공유 페이지용 — 소유자 확인 없이 ID로만 조회. */
  @Transactional(readOnly = true)
  public WorkoutSession getForShare(Long id) {
    return workoutSessionRepository
        .findById(id)
        .orElseThrow(() -> ApiException.notFound("workout_not_found"));
  }

  private static final ZoneId LIST_ZONE = ZoneId.of("Asia/Seoul");

  @Transactional(readOnly = true)
  public List<WorkoutSessionRepository.WorkoutListView> listForUser(UUID userId) {
    return workoutSessionRepository.findListByUserIdOrderByCreatedAtDesc(userId);
  }

  @Transactional(readOnly = true)
  public WorkoutSummaryResponse summaryForUser(UUID userId) {
    WorkoutSessionRepository.WorkoutSummaryAggregate agg =
        workoutSessionRepository.aggregateForUser(userId);
    long totalDistanceM = agg.getTotalDistanceM();
    long totalDurationSec = agg.getTotalDurationSec();

    Integer avgPaceSecPerKm =
        totalDistanceM >= 10
            ? (int) Math.round(totalDurationSec / (totalDistanceM / 1000.0))
            : null;

    return new WorkoutSummaryResponse(
        totalDistanceM,
        totalDurationSec,
        (int) agg.getTotalCalories(),
        (int) agg.getWorkoutCount(),
        (int) agg.getWorkoutDayCount(),
        avgPaceSecPerKm);
  }

  @Transactional(readOnly = true)
  public List<WorkoutSessionRepository.WorkoutListView> listForUserInYear(UUID userId, int year) {
    OffsetDateTime from =
        LocalDate.of(year, 1, 1).atStartOfDay(LIST_ZONE).toOffsetDateTime();
    OffsetDateTime to =
        LocalDate.of(year + 1, 1, 1).atStartOfDay(LIST_ZONE).toOffsetDateTime();
    return workoutSessionRepository
        .findListByUserIdAndStartedAtGreaterThanEqualAndStartedAtLessThanOrderByStartedAtDesc(
            userId, from, to);
  }

  @Transactional
  public void deleteForUser(AuthPrincipal principal, Long id) {
    WorkoutSession session =
        workoutSessionRepository
            .findByIdAndUserId(id, principal.userId())
            .orElseThrow(() -> ApiException.notFound("workout_not_found"));
    // 레이스에 반영된 거리 먼저 차감 (cascade 삭제 전에 호출해야 함)
    challengeProgressService.reverseWorkoutDistance(session.getId());
    String imageUrl = session.getImageUrl();
    workoutSessionRepository.delete(session);
    // S3 삭제는 커밋 후 처리 — 트랜잭션 내 네트워크 I/O로 인한 커넥션 점유 방지
    if (imageUrl != null && !imageUrl.isBlank()) {
      eventPublisher.publishEvent(new WorkoutEvents.WorkoutImageDeletedEvent(imageUrl));
    }
  }

  private String toJson(List<PathPoint> path) {
    try {
      return objectMapper.writeValueAsString(path);
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("path_json_encode_failed", e);
    }
  }

  public List<PathPoint> parsePath(String pathJson) {
    try {
      return objectMapper.readValue(
          pathJson,
          objectMapper.getTypeFactory().constructCollectionType(List.class, PathPoint.class));
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("path_json_decode_failed", e);
    }
  }

  public record PathPoint(double lat, double lng) {}
}
