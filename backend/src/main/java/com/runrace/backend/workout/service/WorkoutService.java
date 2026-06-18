package com.runrace.backend.workout.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.domain.ApprovalStatus;
import com.runrace.backend.challenge.service.ChallengeProgressService;
import com.runrace.backend.challenge.service.IndoorApprovalService;
import com.runrace.backend.challenge.domain.ChallengeWorkout;
import com.runrace.backend.challenge.repository.ChallengeWorkoutRepository;
import com.runrace.backend.challenge.domain.IndoorRunApproval;
import com.runrace.backend.challenge.repository.IndoorRunApprovalRepository;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.event.WorkoutEvents;
import com.runrace.backend.upload.ImageUploadService;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import com.runrace.backend.workout.domain.WorkoutSession;
import com.runrace.backend.workout.domain.WorkoutType;
import com.runrace.backend.workout.dto.PathPointDto;
import com.runrace.backend.workout.dto.WorkoutSummaryResponse;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
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

  // 입력 상한 — 비정상/조작 값 차단 (치팅·메모리 DoS 방지)
  private static final int MAX_DISTANCE_M = 300_000; // 300km
  private static final int MAX_DURATION_SEC = 36 * 3600; // 36h
  private static final int MAX_CALORIES = 100_000;
  private static final int MAX_PATH_POINTS = 100_000;

  private final WorkoutSessionRepository workoutSessionRepository;
  private final AppUserRepository appUserRepository;
  private final ChallengeProgressService challengeProgressService;
  private final IndoorApprovalService indoorApprovalService;
  private final ChallengeWorkoutRepository challengeWorkoutRepository;
  private final IndoorRunApprovalRepository indoorRunApprovalRepository;
  private final ImageUploadService imageUploadService;
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
    if (durationSec < 1 || durationSec > MAX_DURATION_SEC) {
      throw ApiException.badRequest("duration_invalid");
    }
    if (distanceM < 0 || distanceM > MAX_DISTANCE_M) {
      throw ApiException.badRequest("distance_invalid");
    }
    if (calories < 0 || calories > MAX_CALORIES) {
      throw ApiException.badRequest("calories_invalid");
    }
    if (avgPaceSecPerKm != null && avgPaceSecPerKm < 0) {
      throw ApiException.badRequest("pace_invalid");
    }
    if (path == null || path.isEmpty()) {
      throw ApiException.badRequest("path_empty");
    }
    if (path.size() > MAX_PATH_POINTS) {
      throw ApiException.badRequest("path_too_large");
    }
    if (startedAt == null || endedAt == null || !endedAt.isAfter(startedAt)) {
      throw ApiException.badRequest("time_range_invalid");
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
    if (durationSec < 1 || durationSec > MAX_DURATION_SEC) throw ApiException.badRequest("duration_invalid");
    if (distanceM <= 0 || distanceM > MAX_DISTANCE_M) throw ApiException.badRequest("distance_invalid");
    // imageUrl은 우리 S3 버킷에서 발급된 것만 허용 (외부 URL 주입·타인 이미지 삭제 차단)
    if (imageUrl != null && !imageUrl.isBlank() && !imageUploadService.isStoredUrl(imageUrl)) {
      throw ApiException.badRequest("invalid_image_url");
    }

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

  private static final int MAX_MEMO_LENGTH = 500;

  @Transactional
  public void updateMemo(AuthPrincipal principal, Long id, String memo) {
    if (memo != null && memo.length() > MAX_MEMO_LENGTH) {
      throw ApiException.badRequest("memo_too_long");
    }
    WorkoutSession session = workoutSessionRepository
        .findByIdAndUserId(id, principal.userId())
        .orElseThrow(() -> ApiException.notFound("workout_not_found"));
    session.updateMemo(memo == null || memo.isBlank() ? null : memo.strip());
    workoutSessionRepository.save(session);
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

  /** 좌표 저장 정밀도(소수 6자리 ≈ 0.11m). GPS 오차(3~5m)보다 충분히 정밀하면서 저장 용량을 줄인다. */
  private static final double COORD_SCALE = 1_000_000d;

  private String toJson(List<PathPoint> path) {
    try {
      return objectMapper.writeValueAsString(roundCoords(path));
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("path_json_encode_failed", e);
    }
  }

  /** 저장 직전 좌표를 6자리로 반올림한다(거리·페이스는 클라이언트 계산값을 쓰므로 영향 없음). */
  private static List<PathPoint> roundCoords(List<PathPoint> path) {
    return path.stream()
        .map(p -> new PathPoint(roundCoord(p.lat()), roundCoord(p.lng())))
        .toList();
  }

  private static double roundCoord(double value) {
    return Math.round(value * COORD_SCALE) / COORD_SCALE;
  }

  private List<PathPoint> parsePath(String pathJson) {
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
