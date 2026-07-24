package com.runrace.backend.admin.controller;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.common.IsoTime;
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
  private static final List<String> EXCLUDED_DISPLAY_NAMES = List.of("노광고", "방지훈");

  private final AppUserRepository appUserRepository;
  private final WorkoutSessionRepository workoutSessionRepository;

  @Value("${runrace.admin.firebase-uids:}")
  private String adminFirebaseUids;

  @Value("${runrace.admin.display-names:노광고,방지훈}")
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
    return new DashboardResponse(members, workouts);
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

  public record DashboardResponse(List<MemberRow> members, List<WorkoutRow> workouts) {}

  public record MemberRow(
      String displayName, String provider, boolean pushEnabled, String createdAt) {
    static MemberRow from(AppUser user) {
      return new MemberRow(
          user.getDisplayName(), user.getProvider(), user.isPushEnabled(), IsoTime.format(user.getCreatedAt()));
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
}
