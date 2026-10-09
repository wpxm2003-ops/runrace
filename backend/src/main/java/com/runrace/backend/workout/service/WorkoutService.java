package com.runrace.backend.workout.service;

import com.fasterxml.jackson.annotation.JsonInclude;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;
import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.challenge.service.ChallengeProgressService;
import com.runrace.backend.challenge.service.IndoorApprovalService;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.crew.service.CrewMatchService;
import com.runrace.backend.event.WorkoutEvents;
import com.runrace.backend.history.domain.ActivityAction;
import com.runrace.backend.history.domain.ActivityTargetType;
import com.runrace.backend.history.service.ActivityHistoryService;
import com.runrace.backend.shoe.service.ShoeService;
import com.runrace.backend.upload.ImageUploadService;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import com.runrace.backend.workout.domain.WorkoutSession;
import com.runrace.backend.workout.domain.WorkoutType;
import com.runrace.backend.workout.dto.GhostRaceResultDto;
import com.runrace.backend.workout.dto.PathPointDto;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
public class WorkoutService {
  /** 실내러닝 칼로리 추정 계수(kcal/km). */
  private static final int KCAL_PER_KM = 65;

  private static final int MIN_GHOST_OVERLAP_M = 500;
  private static final long GHOST_DELTA_TOLERANCE_MS = 1_000;
  private static final long MAX_GHOST_TIME_MS = com.runrace.backend.common.Distance.MAX_DURATION_SEC * 1_000L;

  private final WorkoutSessionRepository workoutSessionRepository;
  private final AppUserRepository appUserRepository;
  private final ChallengeProgressService challengeProgressService;
  private final CrewMatchService crewMatchService;
  private final IndoorApprovalService indoorApprovalService;
  private final ImageUploadService imageUploadService;
  private final ShoeService shoeService;
  private final ApplicationEventPublisher eventPublisher;
  private final ObjectMapper objectMapper;
  private final ActivityHistoryService activityHistoryService;

  /**
   * 저장 결과 — {@code deduplicated}면 clientWorkoutId가 이미 저장된 요청이라 새로 쓴 것이 없다.
   *
   * <p>호출자가 이 구분을 알아야 하는 이유: 저장 이후 단계(PB·성과 판정)는 저장 시점의 상태를
   * 전제로 계산하는데, 재시도 시점에는 그 상태가 이미 바뀌어 있어 다시 돌리면 틀린 값이 나온다.
   * (예: PB는 첫 요청에서 이미 갱신돼, 재계산하면 "갱신 없음"으로 판정된다.)
   */
  public record SavedWorkout(WorkoutSession session, boolean deduplicated) {}

  @Transactional
  public SavedWorkout create(
      AuthPrincipal principal,
      OffsetDateTime startedAt,
      String startedAtLocal,
      OffsetDateTime endedAt,
      int durationSec,
      int distanceM,
      int calories,
      Integer avgPaceSecPerKm,
      List<PathPoint> path,
      Long ghostWorkoutId,
      GhostRaceResultDto ghostResult,
      UUID clientWorkoutId
  ) {
    // 입력 검증 — 비정상·조작 값 차단
    WorkoutInputValidation.validateGps(
        startedAt, endedAt, durationSec, distanceM, calories, avgPaceSecPerKm, path);

    // 같은 사용자의 동시 저장을 직렬화해 요청 ID 조회와 신규 저장 사이의 경합을 막는다.
    AppUser user = appUserRepository.getRequiredForUpdate(principal.userId());
    WorkoutSession existing = findExistingGpsRequest(
        principal.userId(),
        clientWorkoutId,
        startedAt,
        endedAt,
        durationSec,
        distanceM,
        calories,
        avgPaceSecPerKm);
    if (existing != null) return new SavedWorkout(existing, true);

    // 고스트 레이스 상대 확정 — 지목한 과거 기록이 내 것이 아니거나 결과가 어긋나면 무시된다
    GhostRaceData ghostRace = resolveGhostRace(principal.userId(), ghostWorkoutId, ghostResult);
    WorkoutSession saved = saveGpsSession(
        user,
        clientWorkoutId,
        startedAt,
        resolveStartedAtLocal(startedAtLocal, startedAt),
        endedAt,
        durationSec,
        distanceM,
        calories,
        avgPaceSecPerKm,
        path,
        ghostRace);

    // 현재 참여 중인 진행 레이스에 운동 거리 반영
    challengeProgressService.applyWorkoutDistance(principal.userId(), saved.getId(), distanceM);

    // 진행 중인 크루 대항전 로스터라면, 이 운동으로 방금 상대를 추월했는지 확인해 알린다.
    crewMatchService.checkOvertakeOnWorkout(principal.userId(), distanceM, endedAt);

    // 활성 신발 귀속 + 교체 목표 도달 시 알림 이벤트 발행
    shoeService.attributeActiveShoe(principal.userId(), saved);

    // 라이벌 도발 푸시 — AFTER_COMMIT 리스너가 처리
    eventPublisher.publishEvent(new WorkoutEvents.WorkoutSavedEvent(
        principal.userId(), user.getNickname(), distanceM));

    return new SavedWorkout(saved, false);
  }

  private WorkoutSession saveGpsSession(
      AppUser user,
      UUID clientWorkoutId,
      OffsetDateTime startedAt,
      LocalDateTime startedAtLocal,
      OffsetDateTime endedAt,
      int durationSec,
      int distanceM,
      int calories,
      Integer avgPaceSecPerKm,
      List<PathPoint> path,
      GhostRaceData ghostRace) {
    return workoutSessionRepository.save(WorkoutSession.builder()
        .user(user)
        .clientWorkoutId(clientWorkoutId)
        .startedAt(startedAt)
        .startedAtLocal(startedAtLocal)
        .endedAt(endedAt)
        .durationSec(durationSec)
        .distanceM(distanceM)
        .calories(calories)
        .avgPaceSecPerKm(avgPaceSecPerKm)
        .pathJson(toJson(path))
        .ghostWorkoutId(ghostRace.workoutId())
        .ghostResultJson(ghostRace.resultJson())
        .createdAt(OffsetDateTime.now())
        .build());
  }

  @Transactional
  public SavedWorkout createIndoor(
      AuthPrincipal principal,
      int distanceM,
      int durationSec,
      String startedAt,
      String startedAtLocal,
      String imageUrl,
      UUID clientWorkoutId) {
    // 입력 검증 — 비정상·조작 값 차단
    WorkoutInputValidation.validateIndoor(distanceM, durationSec);
    if (imageUrl != null && !imageUrl.isBlank() && !imageUploadService.isStoredUrl(imageUrl)) {
      throw ApiException.badRequest("invalid_image_url");
    }
    OffsetDateTime start = WorkoutInputValidation.parseStartedAt(startedAt);

    // 운동 저장 — 칼로리·페이스는 거리와 시간에서 산출
    AppUser user = appUserRepository.getRequiredForUpdate(principal.userId());
    WorkoutSession existing = findExistingIndoorRequest(
        principal.userId(), clientWorkoutId, distanceM, durationSec, start, imageUrl);
    if (existing != null) return new SavedWorkout(existing, true);
    WorkoutSession saved = saveIndoorSession(
        user, clientWorkoutId, distanceM, durationSec, start, startedAtLocal, imageUrl);

    activityHistoryService.recordSelf(
        principal.userId(),
        ActivityAction.INDOOR_RUN_REGISTERED,
        ActivityTargetType.WORKOUT,
        saved.getId(),
        Map.of("distanceM", distanceM, "durationSec", durationSec));

    // 참가 중인 레이스마다 구성원 승인 대기 생성 — 승인돼야 레이스 거리로 반영된다
    indoorApprovalService.createPendingIndoorApprovals(principal.userId(), saved, distanceM);

    // 실내러닝도 활성 신발에 귀속(신발 마모는 승인 여부와 무관)
    shoeService.attributeActiveShoe(principal.userId(), saved);

    // 라이벌 도발 푸시 — 실외와 동일하게 저장 시점 발행(AFTER_COMMIT 리스너가 처리).
    // 레이스 승인 대기는 레이스 거리 반영 절차일 뿐, 운동 기록 자체는 이 시점에 확정된다.
    eventPublisher.publishEvent(new WorkoutEvents.WorkoutSavedEvent(
        principal.userId(), user.getNickname(), distanceM));

    return new SavedWorkout(saved, false);
  }

  /**
   * 기기 벽시계(패턴 A: 활동의 로컬 날짜를 활동에 박제) 파싱.
   *
   * <p>벽시계와 UTC 순간의 차는 그 기기의 UTC 오프셋이어야 하므로, 실존 오프셋 범위를 벗어난
   * 값은 버린다 — 날짜 조작으로 스트릭·잔디를 꾸미는 것을 막는다. 값이 없거나(구클라이언트)
   * 무효면 KST 변환 폴백: 기존 저장 동작과 동일해 하위호환이 유지된다.
   */
  static LocalDateTime resolveStartedAtLocal(String startedAtLocal, OffsetDateTime startedAt) {
    return WorkoutInputValidation.resolveStartedAtLocal(startedAtLocal, startedAt);
  }

  private WorkoutSession saveIndoorSession(
      AppUser user,
      UUID clientWorkoutId,
      int distanceM,
      int durationSec,
      OffsetDateTime start,
      String startedAtLocal,
      String imageUrl) {
    OffsetDateTime end = start.plusSeconds(durationSec);

    int calories = Math.max(1, Math.round(distanceM / 1000f * KCAL_PER_KM));
    Integer avgPaceSecPerKm = avgPaceSecPerKm(distanceM, durationSec);

    return workoutSessionRepository.save(WorkoutSession.builder()
        .user(user)
        .clientWorkoutId(clientWorkoutId)
        .workoutType(WorkoutType.INDOOR)
        .startedAt(start)
        .startedAtLocal(resolveStartedAtLocal(startedAtLocal, start))
        .endedAt(end)
        .durationSec(durationSec)
        .distanceM(distanceM)
        .calories(calories)
        .avgPaceSecPerKm(avgPaceSecPerKm)
        .imageUrl(imageUrl)
        .pathJson("[]")
        .createdAt(OffsetDateTime.now())
        .build());
  }

  private WorkoutSession findExistingGpsRequest(
      UUID userId,
      UUID clientWorkoutId,
      OffsetDateTime startedAt,
      OffsetDateTime endedAt,
      int durationSec,
      int distanceM,
      int calories,
      Integer avgPaceSecPerKm) {
    if (clientWorkoutId == null) return null;
    return workoutSessionRepository.findByUserIdAndClientWorkoutId(userId, clientWorkoutId)
        .map(existing -> {
          boolean sameRequest = existing.getWorkoutType() == WorkoutType.GPS
              && sameInstant(existing.getStartedAt(), startedAt)
              && sameInstant(existing.getEndedAt(), endedAt)
              && existing.getDurationSec() == durationSec
              && existing.getDistanceM() == distanceM
              && existing.getCalories() == calories
              && Objects.equals(existing.getAvgPaceSecPerKm(), avgPaceSecPerKm);
          if (!sameRequest) throw ApiException.conflict("workout_request_id_reused");
          return existing;
        })
        .orElse(null);
  }

  private WorkoutSession findExistingIndoorRequest(
      UUID userId,
      UUID clientWorkoutId,
      int distanceM,
      int durationSec,
      OffsetDateTime startedAt,
      String imageUrl) {
    if (clientWorkoutId == null) return null;
    return workoutSessionRepository.findByUserIdAndClientWorkoutId(userId, clientWorkoutId)
        .map(existing -> {
          boolean sameRequest = existing.getWorkoutType() == WorkoutType.INDOOR
              && sameInstant(existing.getStartedAt(), startedAt)
              && existing.getDurationSec() == durationSec
              && existing.getDistanceM() == distanceM
              && Objects.equals(existing.getImageUrl(), imageUrl);
          if (!sameRequest) throw ApiException.conflict("workout_request_id_reused");
          return existing;
        })
        .orElse(null);
  }

  private static boolean sameInstant(OffsetDateTime left, OffsetDateTime right) {
    return left != null && right != null && left.isEqual(right);
  }

  String toJson(List<PathPoint> path) {
    return WorkoutPathSupport.toJson(objectMapper, path);
  }

  /**
   * 고스트 정보는 운동의 부수 데이터다. 값이 잘못됐거나 원본 기록이 사라졌다면 고스트 정보만 버리고
   * 본 운동 저장은 계속한다.
   */
  private GhostRaceData resolveGhostRace(
      UUID userId, Long ghostWorkoutId, GhostRaceResultDto result) {
    if (ghostWorkoutId == null && result == null) return GhostRaceData.EMPTY;
    if (!isGhostRacePayloadValid(ghostWorkoutId, result)) return GhostRaceData.EMPTY;

    WorkoutSession ghost = workoutSessionRepository
        .findByIdAndUserId(ghostWorkoutId, userId)
        .orElse(null);
    if (ghost == null || ghost.getWorkoutType() != WorkoutType.GPS) return GhostRaceData.EMPTY;

    try {
      return new GhostRaceData(ghostWorkoutId, objectMapper.writeValueAsString(result));
    } catch (JacksonException e) {
      return GhostRaceData.EMPTY;
    }
  }

  static boolean isGhostRacePayloadValid(Long ghostWorkoutId, GhostRaceResultDto result) {
    if (ghostWorkoutId == null || ghostWorkoutId <= 0 || result == null) return false;
    if (!Double.isFinite(result.overlapDistanceM())
        || result.overlapDistanceM() < MIN_GHOST_OVERLAP_M
        || result.overlapDistanceM() > com.runrace.backend.common.Distance.MAX_DISTANCE_M
        || result.myTimeMs() <= 0
        || result.myTimeMs() > MAX_GHOST_TIME_MS
        || result.ghostTimeMs() <= 0
        || result.ghostTimeMs() > MAX_GHOST_TIME_MS
        || result.deltaMs() < -MAX_GHOST_TIME_MS
        || result.deltaMs() > MAX_GHOST_TIME_MS
        || Math.abs(result.deltaMs() - (result.myTimeMs() - result.ghostTimeMs()))
            > GHOST_DELTA_TOLERANCE_MS) return false;
    return true;
  }

  private record GhostRaceData(Long workoutId, String resultJson) {
    private static final GhostRaceData EMPTY = new GhostRaceData(null, null);
  }

  /** 저장된 경로 JSON을 응답용 좌표 목록으로 변환한다(상세·공유 응답 공통). */
  public List<PathPointDto> toPath(String pathJson) {
    return WorkoutPathSupport.toPath(objectMapper, pathJson);
  }

  /** 공유 페이지 전용 — {@link #toPath}에 프라이버시 절단을 더한 것. */
  public List<PathPointDto> toSharePath(String pathJson) {
    return WorkoutPathSupport.truncateForShare(toPath(pathJson));
  }

  /** 평균 페이스(초/km). {@link #MIN_DISTANCE_FOR_PACE_M} 미만이면 null. */
  static Integer avgPaceSecPerKm(long distanceM, long durationSec) {
    return WorkoutInputValidation.avgPaceSecPerKm(distanceM, durationSec);
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record PathPoint(
      double lat, double lng, Long t, Double ele, Boolean breakBefore) {

    public PathPoint(double lat, double lng, Long t) {
      this(lat, lng, t, null, null);
    }

    public PathPoint(double lat, double lng, Long t, Double ele) {
      this(lat, lng, t, ele, null);
    }
  }
}
