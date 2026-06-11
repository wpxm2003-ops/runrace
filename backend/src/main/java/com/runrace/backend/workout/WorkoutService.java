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
import com.runrace.backend.workout.dto.PathPointDto;
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
  /** 평균 페이스를 계산할 최소 거리(m) — 그 미만은 의미 있는 페이스를 산출하지 않는다. */
  static final int MIN_DISTANCE_FOR_PACE_M = 10;
  /** 실내러닝 칼로리 추정 계수(kcal/km). */
  private static final int KCAL_PER_KM = 65;

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

    // 현재 참여 중인 진행 레이스에 운동 거리 반영
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

    int calories = Math.max(1, Math.round(distanceM / 1000f * KCAL_PER_KM));
    Integer avgPaceSecPerKm = avgPaceSecPerKm(distanceM, durationSec);

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
      voted |= applyMyVote(cw, principal.userId(), approved);
    }
    if (!voted) throw ApiException.forbidden("not_a_voter");
  }

  /**
   * 한 ChallengeWorkout에 대한 내 승인/거부 투표를 반영한다.
   * 투표권이 없으면 아무것도 하지 않고 false, 반영했으면 true를 반환한다.
   * 거부 시 즉시 reject, 승인으로 전원 승인이 충족되면 거리 반영을 위임한다.
   */
  private boolean applyMyVote(ChallengeWorkout cw, UUID voterId, boolean approved) {
    IndoorRunApproval myVote = indoorRunApprovalRepository
        .findByChallengeWorkoutIdAndVoterId(cw.getId(), voterId)
        .orElse(null);
    if (myVote == null) return false;
    if (myVote.getApproved() != null) throw ApiException.badRequest("already_voted");

    myVote.castVote(approved);
    indoorRunApprovalRepository.save(myVote);

    if (!approved) {
      cw.reject();
      challengeWorkoutRepository.save(cw);
    } else if (indoorApprovalService.isFullyApproved(cw.getId())) {
      indoorApprovalService.applyApprovedIndoorRun(cw.getId());
    }
    return true;
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

    Integer avgPaceSecPerKm = avgPaceSecPerKm(totalDistanceM, totalDurationSec);

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

  /** 저장된 경로 JSON을 응답용 좌표 목록으로 변환한다(상세·공유 응답 공통). */
  public List<PathPointDto> toPath(String pathJson) {
    return parsePath(pathJson).stream()
        .map(p -> new PathPointDto(p.lat(), p.lng()))
        .toList();
  }

  /** 평균 페이스(초/km). {@link #MIN_DISTANCE_FOR_PACE_M} 미만이면 null. */
  static Integer avgPaceSecPerKm(long distanceM, long durationSec) {
    if (distanceM < MIN_DISTANCE_FOR_PACE_M) return null;
    return (int) Math.round(durationSec / (distanceM / 1000.0));
  }

  public record PathPoint(double lat, double lng) {}
}
