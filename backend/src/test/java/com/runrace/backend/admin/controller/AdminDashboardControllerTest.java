package com.runrace.backend.admin.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.runrace.backend.user.domain.AppUser;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;

class AdminDashboardControllerTest {

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
