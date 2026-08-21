package com.runrace.backend.admin.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.IsoTime;
import com.runrace.backend.feedback.domain.Feedback;
import com.runrace.backend.feedback.repository.FeedbackRepository;
import com.runrace.backend.history.repository.UserActivityHistoryRepository;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminDashboardController {
  /**
   * 대시보드 목록에서 감출 운영자 이름. 운동·활동 두 조회가 같은 목록을 써야 한 쪽만
   * 갱신돼 어긋나지 않는다(이전에는 동일 내용의 상수가 두 벌이었다).
   */
  private static final List<String> EXCLUDED_DISPLAY_NAMES = List.of("노광고", "방지훈", "배하영");

  private final AppUserRepository appUserRepository;
  private final WorkoutSessionRepository workoutSessionRepository;
  private final FeedbackRepository feedbackRepository;
  private final UserActivityHistoryRepository userActivityHistoryRepository;
  private final ObjectMapper objectMapper;

  @Value("${runrace.admin.firebase-uids:}")
  private String adminFirebaseUids;

  @Value("${runrace.admin.display-names:노광고,방지훈,배하영}")
  private String adminDisplayNames;

  @GetMapping("/dashboard")
  public DashboardResponse dashboard(AuthPrincipal principal) {
    ensureAdmin(principal);

    var pageable = PageRequest.of(0, 10);
    List<MemberRow> members = appUserRepository.findRecentActiveUsers(pageable).stream()
        .map(MemberRow::from)
        .toList();
    List<WorkoutRow> workouts = workoutSessionRepository
        .findRecentForAdmin(EXCLUDED_DISPLAY_NAMES, pageable).stream()
        .map(WorkoutRow::from)
        .toList();
    List<FeedbackRow> feedback = feedbackRepository
        .findAllByOrderByCreatedAtDesc(PageRequest.of(0, 30)).stream()
        .map(this::toFeedbackRow)
        .toList();
    List<ActivityRow> activities = userActivityHistoryRepository
        .findRecentForAdmin(EXCLUDED_DISPLAY_NAMES, pageable).stream()
        .map(ActivityRow::from)
        .toList();
    return new DashboardResponse(members, workouts, activities, feedback);
  }

  private void ensureAdmin(AuthPrincipal principal) {
    Set<String> allowed = Arrays.stream(adminFirebaseUids.split(","))
        .map(String::trim)
        .filter(value -> !value.isEmpty())
        .collect(Collectors.toSet());
    boolean allowedByUid = allowed.contains(principal.firebaseUid());
    String displayName = appUserRepository.findById(principal.userId())
        .map(AppUser::getDisplayName)
        .orElse(null);
    boolean allowedByDisplayName = displayName != null && adminDisplayNamesSet().contains(displayName);
    if (!allowedByUid && !allowedByDisplayName) {
      throw ApiException.forbidden("admin_access_required");
    }
  }

  private Set<String> adminDisplayNamesSet() {
    return Arrays.stream(adminDisplayNames.split(","))
        .map(String::trim)
        .filter(value -> !value.isEmpty())
        .collect(Collectors.toSet());
  }

  public record DashboardResponse(
      List<MemberRow> members,
      List<WorkoutRow> workouts,
      List<ActivityRow> activities,
      List<FeedbackRow> feedback) {}

  public record ActivityRow(
      Long id,
      String displayName,
      String actionType,
      String targetType,
      String occurredAt) {
    static ActivityRow from(UserActivityHistoryRepository.AdminActivityView activity) {
      return new ActivityRow(
          activity.getId(),
          activity.getDisplayName(),
          activity.getActionType().name(),
          activity.getTargetType().name(),
          IsoTime.format(activity.getOccurredAt()));
    }
  }

  public record MemberRow(
      String displayName,
      String nickname,
      String provider,
      boolean pushEnabled,
      /** 푸시 알림 문구 언어이자 UI 언어(users.lang_cd). */
      String langCd,
      /** 기기에서 수집한 IANA 타임존 — 해외 사용자 분포 파악용. */
      String timeZone,
      String createdAt) {
    static MemberRow from(AppUser user) {
      return new MemberRow(
          user.getDisplayName(),
          user.getNickname(),
          user.getProvider(),
          user.isPushEnabled(),
          user.getLangCd(),
          user.getTimeZone(),
          IsoTime.format(user.getCreatedAt()));
    }
  }

  public record WorkoutRow(
      Long id,
      String displayName,
      int distanceM,
      int durationSec,
      String startedAt,
      String endedAt,
      String createdAt,
      boolean hasImage,
      boolean hasMemo) {
    static WorkoutRow from(WorkoutSessionRepository.AdminWorkoutView workout) {
      return new WorkoutRow(
          workout.getId(),
          workout.getDisplayName(),
          workout.getDistanceM(),
          workout.getDurationSec(),
          IsoTime.format(workout.getStartedAt()),
          IsoTime.format(workout.getEndedAt()),
          IsoTime.format(workout.getCreatedAt()),
          workout.getImageUrl() != null && !workout.getImageUrl().isBlank(),
          workout.getMemo() != null && !workout.getMemo().isBlank());
    }
  }

  public record FeedbackRow(
      Long id,
      String userDisplayName,
      String type,
      String title,
      String content,
      List<String> imageUrls,
      String status,
      String pageUrl,
      String userAgent,
      String appVersion,
      String createdAt) {}

  private FeedbackRow toFeedbackRow(Feedback feedback) {
    List<String> imageUrls;
    try {
      imageUrls = objectMapper.readValue(
          feedback.getImageUrlsJson(), new TypeReference<List<String>>() {});
    } catch (Exception ignored) {
      imageUrls = List.of();
    }
    return new FeedbackRow(
        feedback.getId(),
        feedback.getUserDisplayName(),
        feedback.getType(),
        feedback.getTitle(),
        feedback.getContent(),
        imageUrls,
        feedback.getStatus(),
        feedback.getPageUrl(),
        feedback.getUserAgent(),
        feedback.getAppVersion(),
        IsoTime.format(feedback.getCreatedAt()));
  }
}
