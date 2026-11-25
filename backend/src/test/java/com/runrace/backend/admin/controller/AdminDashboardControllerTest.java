package com.runrace.backend.admin.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.runrace.backend.activity.dto.RetentionMetricsResponse;
import com.runrace.backend.activity.service.RetentionMetricsService;
import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.feedback.repository.FeedbackRepository;
import com.runrace.backend.history.repository.UserActivityHistoryRepository;
import com.runrace.backend.user.domain.AppUser;
import com.runrace.backend.user.repository.AppUserRepository;
import com.runrace.backend.workout.repository.WorkoutSessionRepository;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.ObjectMapper;

class AdminDashboardControllerTest {

  private final AppUserRepository appUserRepository = mock(AppUserRepository.class);
  private final RetentionMetricsService retentionMetricsService = mock(RetentionMetricsService.class);

  private AdminDashboardController controller(String adminUids) {
    AdminDashboardController controller = new AdminDashboardController(
        appUserRepository,
        mock(WorkoutSessionRepository.class),
        mock(FeedbackRepository.class),
        mock(UserActivityHistoryRepository.class),
        retentionMetricsService,
        mock(ObjectMapper.class));
    ReflectionTestUtils.setField(controller, "adminFirebaseUids", adminUids);
    ReflectionTestUtils.setField(controller, "adminDisplayNames", "운영자");
    return controller;
  }

  @Test
  void retentionRejectsNonAdmin() {
    UUID userId = UUID.randomUUID();
    when(appUserRepository.findById(userId))
        .thenReturn(Optional.of(AppUser.builder().id(userId).displayName("일반회원").build()));

    ApiException e = assertThrows(ApiException.class,
        () -> controller("admin-uid").retention(new AuthPrincipal(userId, "someone")));

    assertEquals("admin_access_required", e.code());
    verifyNoInteractions(retentionMetricsService);
  }

  /** 운영자 계정은 다른 대시보드 목록과 같은 이름 목록으로 집계에서 뺀다. */
  @Test
  void retentionExcludesOperatorAccounts() {
    UUID userId = UUID.randomUUID();
    when(appUserRepository.findById(userId)).thenReturn(Optional.empty());
    RetentionMetricsResponse metrics =
        new RetentionMetricsResponse("2026-11-25", "Asia/Seoul", null, null, 0, null, null, List.of());
    when(retentionMetricsService.compute(List.of("노광고", "방지훈", "배하영"))).thenReturn(metrics);

    var result = controller("admin-uid").retention(new AuthPrincipal(userId, "admin-uid"));

    assertSame(metrics, result);
  }

  @Test
  void recentMemberRowIncludesNickname() {
    OffsetDateTime createdAt = OffsetDateTime.parse("2026-08-09T12:34:56+09:00");
    AppUser user = AppUser.builder()
        .displayName("또또또")
        .nickname("용감한호랑이57389")
        .provider("kakao")
        .pushEnabled(true)
        .createdAt(createdAt)
        .build();

    var row = AdminDashboardController.MemberRow.from(user);

    assertEquals("또또또", row.displayName());
    assertEquals("용감한호랑이57389", row.nickname());
    assertEquals("kakao", row.provider());
    assertTrue(row.pushEnabled());
    assertEquals("2026-08-09T12:34:56+09:00", row.createdAt());
  }
}
