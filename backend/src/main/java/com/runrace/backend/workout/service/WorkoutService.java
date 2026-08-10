package com.runrace.backend.workout.service;

import com.fasterxml.jackson.annotation.JsonInclude;
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
import com.runrace.backend.common.KstTime;
import com.runrace.backend.crew.service.CrewMatchService;
import com.runrace.backend.event.WorkoutEvents;
import com.runrace.backend.shoe.service.ShoeService;
import com.runrace.backend.upload.ImageUploadService;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import com.runrace.backend.workout.domain.WorkoutSession;
import com.runrace.backend.workout.domain.WorkoutType;
import com.runrace.backend.workout.dto.GhostRaceResultDto;
import com.runrace.backend.workout.dto.PathPointDto;
import com.runrace.backend.workout.dto.PreviousWorkoutDto;
import com.runrace.backend.workout.dto.WorkoutComparisonResponse;
import com.runrace.backend.workout.dto.WorkoutSummaryResponse;
import com.runrace.backend.workout.repository.PersonalBestRepository;
import com.runrace.backend.workout.repository.WorkoutComparisonItem;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
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
  /** 평균 페이스를 계산할 최소 거리(m) — 그 미만은 의미 있는 페이스를 산출하지 않는다. */
  static final int MIN_DISTANCE_FOR_PACE_M = 10;
  /** 실내러닝 칼로리 추정 계수(kcal/km). */
  private static final int KCAL_PER_KM = 65;

  // 입력 상한 — 비정상/조작 값 차단 (치팅·메모리 DoS 방지)
  private static final int MAX_DISTANCE_M = 300_000; // 300km
  private static final int MAX_DURATION_SEC = 36 * 3600; // 36h
  private static final int MAX_CALORIES = 100_000;
  private static final int MAX_PATH_POINTS = 100_000;
  /** 실내러닝 시작 시각의 미래 허용 오차(분) — 기기 시계가 조금 빠른 경우를 흡수한다. */
  private static final int STARTED_AT_FUTURE_SKEW_MIN = 10;
  /**
   * GPS 경로 포인트 최소 밀도(m/포인트). 클라이언트는 실제로 최소 이동거리(workoutTrack.ts의
   * MIN_MOVE_METERS=4m)마다 포인트를 하나씩 남긴다. 그보다 훨씬 느슨한 상한을 둬 GPS 끊김·정지
   * 구간을 넉넉히 흡수하면서도, "포인트 1개로 300km" 같은 노골적 조작(신고 거리 대비 포인트가
   * 터무니없이 적은 경우)은 걸러낸다. 경로 실거리를 재계산해 신고 거리와 비교하지는 않는다 —
   * GPS 오차(터널·건물숲 등)로 인한 정직한 사용자 오탐을 피하려고 의도적으로 포인트 "개수"만
   * 보고, 거리 재계산·오차허용 비교는 하지 않는다.
   */
  private static final int MAX_PATH_POINT_SPACING_M = 50;
  /** durationSec(활동시간)이 시작~종료 시각 범위를 넘어설 수 없다 — 초과분은 시계 오차 흡수용 여유. */
  private static final int TIME_CONSISTENCY_TOLERANCE_SEC = 5;
  private static final double MIN_LAT = -90;
  private static final double MAX_LAT = 90;
  private static final double MIN_LNG = -180;
  private static final double MAX_LNG = 180;
  private static final int MIN_GHOST_OVERLAP_M = 500;
  private static final long GHOST_DELTA_TOLERANCE_MS = 1_000;
  private static final long MAX_GHOST_TIME_MS = MAX_DURATION_SEC * 1_000L;
  /** 공유 페이지에서 경로 시작·종료 부근을 잘라내는 반경(m) — 거주지 추론 방지. */
  private static final double SHARE_PATH_TRUNCATE_M = 250;

  private final WorkoutSessionRepository workoutSessionRepository;
  private final AppUserRepository appUserRepository;
  private final ChallengeProgressService challengeProgressService;
  private final CrewMatchService crewMatchService;
  private final IndoorApprovalService indoorApprovalService;
  private final ChallengeWorkoutRepository challengeWorkoutRepository;
  private final IndoorRunApprovalRepository indoorRunApprovalRepository;
  private final ImageUploadService imageUploadService;
  private final PersonalBestRepository personalBestRepository;
  private final ShoeService shoeService;
  private final ApplicationEventPublisher eventPublisher;
  private final ObjectMapper objectMapper;

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
    validateGpsInput(startedAt, endedAt, durationSec, distanceM, calories, avgPaceSecPerKm, path);

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

  private void validateGpsInput(
      OffsetDateTime startedAt,
      OffsetDateTime endedAt,
      int durationSec,
      int distanceM,
      int calories,
      Integer avgPaceSecPerKm,
      List<PathPoint> path) {
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
    if (startedAt.isAfter(OffsetDateTime.now().plusMinutes(STARTED_AT_FUTURE_SKEW_MIN))) {
      throw ApiException.badRequest("started_at_future");
    }
    long wallClockSec = Duration.between(startedAt, endedAt).getSeconds();
    if (durationSec > wallClockSec + TIME_CONSISTENCY_TOLERANCE_SEC) {
      throw ApiException.badRequest("duration_exceeds_time_range");
    }
    int minPathPoints = (int) Math.ceil(distanceM / (double) MAX_PATH_POINT_SPACING_M);
    if (path.size() < minPathPoints) {
      throw ApiException.badRequest("path_too_sparse");
    }
    validatePathPoints(path);
  }

  /**
   * 좌표 범위(및 finite 여부)와 t(경과 ms)의 비음수·비내림차순만 확인한다 — t가 없는 포인트
   * (구형 기록)는 순서 검사를 건너뛴다. 포인트가 2개 이상인데 전부 좌표가 동일하면 거부한다
   * ("포인트 밀도" 검사(path_too_sparse)만으로는 같은 좌표를 밀도 요건만큼 반복 제출하는
   * 우회가 가능해서다). 실제 이동 중 GPS 기록은 좌표가 계속 바뀌므로, 이 검사는 오차 허용치
   * 없는 단순 동일성 비교라 정직한 사용자를 오탐할 여지가 없다 — 경로 실거리 재계산·비교는
   * 하지 않는다(터널·건물숲 등 GPS 오차로 인한 오탐 위험이 커서 의도적으로 뺐다).
   */
  private static void validatePathPoints(List<PathPoint> path) {
    Long prevT = null;
    boolean allSameCoord = path.size() > 1;
    double firstLat = path.get(0).lat();
    double firstLng = path.get(0).lng();
    for (PathPoint point : path) {
      if (!Double.isFinite(point.lat()) || !Double.isFinite(point.lng())
          || point.lat() < MIN_LAT || point.lat() > MAX_LAT
          || point.lng() < MIN_LNG || point.lng() > MAX_LNG) {
        throw ApiException.badRequest("path_point_invalid");
      }
      if (point.lat() != firstLat || point.lng() != firstLng) {
        allSameCoord = false;
      }
      Long t = point.t();
      if (t != null) {
        if (t < 0 || (prevT != null && t < prevT)) {
          throw ApiException.badRequest("path_point_invalid");
        }
        prevT = t;
      }
    }
    if (allSameCoord) {
      throw ApiException.badRequest("path_all_same_point");
    }
  }

  private WorkoutSession saveGpsSession(
      AppUser user,
      UUID clientWorkoutId,
      OffsetDateTime startedAt,
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
      String imageUrl,
      UUID clientWorkoutId) {
    // 입력 검증 — 비정상·조작 값 차단
    validateIndoorInput(distanceM, durationSec, imageUrl);
    OffsetDateTime start = parseStartedAt(startedAt);

    // 운동 저장 — 칼로리·페이스는 거리와 시간에서 산출
    AppUser user = appUserRepository.getRequiredForUpdate(principal.userId());
    WorkoutSession existing = findExistingIndoorRequest(
        principal.userId(), clientWorkoutId, distanceM, durationSec, start, imageUrl);
    if (existing != null) return new SavedWorkout(existing, true);
    WorkoutSession saved = saveIndoorSession(
        user, clientWorkoutId, distanceM, durationSec, start, imageUrl);

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

  private void validateIndoorInput(int distanceM, int durationSec, String imageUrl) {
    if (durationSec < 1 || durationSec > MAX_DURATION_SEC) throw ApiException.badRequest("duration_invalid");
    if (distanceM <= 0 || distanceM > MAX_DISTANCE_M) throw ApiException.badRequest("distance_invalid");
    // imageUrl은 우리 S3 버킷에서 발급된 것만 허용 (외부 URL 주입·타인 이미지 삭제 차단)
    if (imageUrl != null && !imageUrl.isBlank() && !imageUploadService.isStoredUrl(imageUrl)) {
      throw ApiException.badRequest("invalid_image_url");
    }
  }

  /**
   * 실내러닝 시작 시각 파싱 — 잘못된 값은 400으로 돌려준다.
   * 검증 없이 바로 파싱하면 null·형식 오류가 다른 입력들과 달리 500이 된다.
   * 미래 시각은 주간·월간 집계를 앞당겨 오염시키므로 기기 시계 오차({@value #STARTED_AT_FUTURE_SKEW_MIN}분)까지만 허용한다.
   */
  private static OffsetDateTime parseStartedAt(String startedAt) {
    if (startedAt == null || startedAt.isBlank()) throw ApiException.badRequest("started_at_invalid");
    OffsetDateTime start;
    try {
      start = OffsetDateTime.parse(startedAt);
    } catch (DateTimeParseException e) {
      throw ApiException.badRequest("started_at_invalid");
    }
    if (start.isAfter(OffsetDateTime.now().plusMinutes(STARTED_AT_FUTURE_SKEW_MIN))) {
      throw ApiException.badRequest("started_at_future");
    }
    return start;
  }

  private WorkoutSession saveIndoorSession(
      AppUser user,
      UUID clientWorkoutId,
      int distanceM,
      int durationSec,
      OffsetDateTime start,
      String imageUrl) {
    OffsetDateTime end = start.plusSeconds(durationSec);

    int calories = Math.max(1, Math.round(distanceM / 1000f * KCAL_PER_KM));
    Integer avgPaceSecPerKm = avgPaceSecPerKm(distanceM, durationSec);

    return workoutSessionRepository.save(WorkoutSession.builder()
        .user(user)
        .clientWorkoutId(clientWorkoutId)
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

  @Transactional
  public void voteIndoorRun(AuthPrincipal principal, Long workoutId, boolean approved) {
    // 마지막 두 투표가 거의 동시에 들어와도 행 잠금으로 서로를 직렬화해
    // 뒤 트랜잭션이 앞 트랜잭션의 커밋된 투표 상태를 반드시 보게 한다.
    List<ChallengeWorkout> pending = challengeWorkoutRepository
        .findAllByWorkoutSessionIdForUpdate(workoutId)
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
        .findDetailByIdAndUserId(id, userId)
        .orElseThrow(() -> ApiException.notFound("workout_not_found"));
  }

  /** 공개 공유 페이지용 — 소유자 확인 없이 ID로만 조회. */
  @Transactional(readOnly = true)
  public WorkoutSession getForShare(Long id) {
    return workoutSessionRepository
        .findById(id)
        .orElseThrow(() -> ApiException.notFound("workout_not_found"));
  }

  private static final ZoneId LIST_ZONE = KstTime.ZONE;

  @Transactional(readOnly = true)
  public WorkoutSummaryResponse summaryForUser(UUID userId) {
    WorkoutSessionRepository.WorkoutSummaryAggregate agg =
        workoutSessionRepository.aggregateForUser(userId);
    long totalDistanceM = agg.getTotalDistanceM();
    long totalDurationSec = agg.getTotalDurationSec();

    Integer avgPaceSecPerKm = avgPaceSecPerKm(totalDistanceM, totalDurationSec);

    int maxStreakDays = workoutSessionRepository.maxStreakDaysForUser(userId);

    return new WorkoutSummaryResponse(
        totalDistanceM,
        totalDurationSec,
        (int) agg.getTotalCalories(),
        (int) agg.getWorkoutCount(),
        (int) agg.getWorkoutDayCount(),
        avgPaceSecPerKm,
        maxStreakDays);
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

  private static final int COMPARISON_LOOKBACK_DAYS = 30;

  /** 최근 30일 평균 비교 + 직전 기록. */
  @Transactional(readOnly = true)
  public WorkoutComparisonResponse getComparison(AuthPrincipal principal, Long id) {
    WorkoutSession current = getForUser(principal.userId(), id);
    OffsetDateTime from = current.getStartedAt().minusDays(COMPARISON_LOOKBACK_DAYS);

    // 상한은 기준 운동의 시작 시각 — 그 이후 기록이 "이전 30일 평균"에 섞이지 않게 한다.
    List<WorkoutComparisonItem> recent =
        workoutSessionRepository.findRecentForComparison(
            principal.userId(), id, from, current.getStartedAt());

    PreviousWorkoutDto previous =
        findPreviousWorkout(principal.userId(), id, current.getStartedAt());

    // 비교할 최근 기록이 없으면 직전 기록만 담아 반환
    if (recent.isEmpty()) return WorkoutComparisonResponse.builder().previous(previous).build();

    return averageComparison(recent, previous);
  }

  private PreviousWorkoutDto findPreviousWorkout(UUID userId, Long id, OffsetDateTime before) {
    return workoutSessionRepository
        .findPreviousForComparison(userId, id, before)
        .map(w -> new PreviousWorkoutDto(w.distanceM(), w.durationSec(), w.avgPaceSecPerKm()))
        .orElse(null);
  }

  /** 최근 기록들의 평균 거리·시간·페이스를 낸다. 페이스는 값이 있는 기록만 평균한다. */
  private WorkoutComparisonResponse averageComparison(
      List<WorkoutComparisonItem> recent, PreviousWorkoutDto previous) {
    int count = recent.size();

    long totalDist = 0;
    long totalDur = 0;
    long paceSum = 0;
    int paceCount = 0;
    for (WorkoutComparisonItem w : recent) {
      totalDist += w.distanceM();
      totalDur += w.durationSec();
      if (w.avgPaceSecPerKm() != null) {
        paceSum += w.avgPaceSecPerKm();
        paceCount++;
      }
    }

    return WorkoutComparisonResponse.builder()
        .recentCount(count)
        .avgDistanceM((int) (totalDist / count))
        .avgDurationSec((int) (totalDur / count))
        .avgPaceSec(paceCount > 0 ? (int) (paceSum / paceCount) : null)
        .previous(previous)
        .build();
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

  /** 운동 사진 설정·교체·삭제. imageUrl이 null/blank면 삭제. 교체로 떨어진 기존 이미지는 커밋 후 정리. */
  @Transactional
  public void updateImage(AuthPrincipal principal, Long id, String imageUrl) {
    String normalized = imageUrl == null || imageUrl.isBlank() ? null : imageUrl.strip();
    // 우리 S3 버킷에서 발급된 URL만 허용 (외부 URL 주입·타인 이미지 삭제 차단)
    if (normalized != null && !imageUploadService.isStoredUrl(normalized)) {
      throw ApiException.badRequest("invalid_image_url");
    }
    WorkoutSession session = workoutSessionRepository
        .findByIdAndUserId(id, principal.userId())
        .orElseThrow(() -> ApiException.notFound("workout_not_found"));
    String previous = session.getImageUrl();
    session.updateImage(normalized);
    workoutSessionRepository.save(session);
    // 교체·삭제로 떨어져 나간 기존 이미지는 커밋 후 S3에서 정리
    if (previous != null && !previous.isBlank() && !previous.equals(normalized)) {
      eventPublisher.publishEvent(new WorkoutEvents.WorkoutImageDeletedEvent(previous));
    }
  }

  @Transactional
  public void deleteForUser(AuthPrincipal principal, Long id) {
    WorkoutSession session =
        workoutSessionRepository
            .findByIdAndUserId(id, principal.userId())
            .orElseThrow(() -> ApiException.notFound("workout_not_found"));
    // 레이스에 반영된 거리 먼저 차감 (cascade 삭제 전에 호출해야 함)
    challengeProgressService.reverseWorkoutDistance(session.getId());
    // 이 운동이 근거인 개인 기록도 함께 삭제한다. personal_best.workout_id는 ON DELETE가
    // 없는 FK라(V33) 남겨두면 삭제가 통째로 롤백된다. 기록의 근거가 사라지면 기록도
    // 사라지는 게 정합이며(레이스 거리 차감과 같은 철학), 다음 달성 시 다시 등록된다.
    personalBestRepository.deleteAll(personalBestRepository.findAllByWorkoutId(session.getId()));
    String imageUrl = session.getImageUrl();
    workoutSessionRepository.delete(session);
    // S3 삭제는 커밋 후 처리 — 트랜잭션 내 네트워크 I/O로 인한 커넥션 점유 방지
    if (imageUrl != null && !imageUrl.isBlank()) {
      eventPublisher.publishEvent(new WorkoutEvents.WorkoutImageDeletedEvent(imageUrl));
    }
  }

  /** 좌표 저장 정밀도(소수 6자리 ≈ 0.11m). GPS 오차(3~5m)보다 충분히 정밀하면서 저장 용량을 줄인다. */
  private static final double COORD_SCALE = 1_000_000d;

  String toJson(List<PathPoint> path) {
    try {
      // 원본 GPS 고도를 보존해야 DEM 교체·장애·데이터셋 변경 시 언제든 다시 보정할 수 있다.
      return objectMapper.writeValueAsString(roundCoords(path));
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("path_json_encode_failed", e);
    }
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
    } catch (JsonProcessingException e) {
      return GhostRaceData.EMPTY;
    }
  }

  static boolean isGhostRacePayloadValid(Long ghostWorkoutId, GhostRaceResultDto result) {
    if (ghostWorkoutId == null || ghostWorkoutId <= 0 || result == null) return false;
    if (!Double.isFinite(result.overlapDistanceM())
        || result.overlapDistanceM() < MIN_GHOST_OVERLAP_M
        || result.overlapDistanceM() > MAX_DISTANCE_M
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

  /** 저장 직전 좌표를 6자리로 반올림한다(거리·페이스는 클라이언트 계산값을 쓰므로 영향 없음). */
  private static List<PathPoint> roundCoords(List<PathPoint> path) {
    return path.stream()
        .map(p -> new PathPoint(
            roundCoord(p.lat()),
            roundCoord(p.lng()),
            p.t(),
            roundElevation(p.ele()),
            p.breakBefore()))
        .toList();
  }

  private static double roundCoord(double value) {
    return Math.round(value * COORD_SCALE) / COORD_SCALE;
  }

  private static Double roundElevation(Double value) {
    if (value == null || !Double.isFinite(value)) return null;
    return Math.round(value * 10d) / 10d;
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
        .map(p -> new PathPointDto(
            p.lat(), p.lng(), p.t(), roundElevation(p.ele()), p.breakBefore()))
        .toList();
  }

  /** 공유 페이지 전용 — {@link #toPath}에 프라이버시 절단을 더한 것. */
  public List<PathPointDto> toSharePath(String pathJson) {
    return truncateForShare(toPath(pathJson));
  }

  private static double haversineMeters(PathPointDto a, PathPointDto b) {
    double toRad = Math.PI / 180;
    double dLat = (b.lat() - a.lat()) * toRad;
    double dLng = (b.lng() - a.lng()) * toRad;
    double lat1 = a.lat() * toRad;
    double lat2 = b.lat() * toRad;
    double h = Math.pow(Math.sin(dLat / 2), 2)
        + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(dLng / 2), 2);
    // 부동소수 오차로 h가 [0,1]을 살짝 벗어나면 asin이 NaN이 되므로 클램프한다.
    double clampedH = Math.max(0, Math.min(1, h));
    return 2 * 6_371_000 * Math.asin(Math.sqrt(clampedH));
  }

  private static double creditedPathMeters(PathPointDto a, PathPointDto b) {
    return Boolean.TRUE.equals(b.breakBefore()) ? 0 : haversineMeters(a, b);
  }

  /**
   * 공유용 경로 — 시작·종료 {@value #SHARE_PATH_TRUNCATE_M}m 구간을 잘라 거주지 추론을 어렵게 한다.
   * 잘라내고 남는 중간 구간이 2점 미만이면(짧은 왕복 러닝 등) 통째로 빈 경로를 반환한다 —
   * 노출보다 "경로 없음" 표시가 낫다.
   */
  private static List<PathPointDto> truncateForShare(List<PathPointDto> path) {
    // 1점 이하는 잘라낼 앞뒤 구간이 없다 — 있는 그대로 내보내면 "노출보다 없음이 낫다"는
    // 이 메서드의 목적과 어긋나므로(1점=사실상 시작·끝이 같은 지점) 빈 경로로 취급한다.
    if (path.size() < 2) return List.of();
    int startIdx = 0;
    double acc = 0;
    while (startIdx < path.size() - 1 && acc < SHARE_PATH_TRUNCATE_M) {
      acc += creditedPathMeters(path.get(startIdx), path.get(startIdx + 1));
      startIdx++;
    }
    int endIdx = path.size() - 1;
    acc = 0;
    while (endIdx > 0 && acc < SHARE_PATH_TRUNCATE_M) {
      acc += creditedPathMeters(path.get(endIdx - 1), path.get(endIdx));
      endIdx--;
    }
    if (endIdx <= startIdx) return List.of();
    return path.subList(startIdx, endIdx + 1);
  }

  /** 평균 페이스(초/km). {@link #MIN_DISTANCE_FOR_PACE_M} 미만이면 null. */
  static Integer avgPaceSecPerKm(long distanceM, long durationSec) {
    if (distanceM < MIN_DISTANCE_FOR_PACE_M) return null;
    return (int) Math.round(durationSec / (distanceM / 1000.0));
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
