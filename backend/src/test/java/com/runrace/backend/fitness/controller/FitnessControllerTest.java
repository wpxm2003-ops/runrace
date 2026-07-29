package com.runrace.backend.fitness.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.fitness.dto.UpsertDailyDistanceRequest;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

/** 헬스 동기화 엔드포인트가 막혀 있음을 고정한다 — 사유는 클래스 javadoc 참조. */
class FitnessControllerTest {

  @Test
  void upsert_alwaysRejectsWithNotFound() {
    FitnessController controller = new FitnessController();
    AuthPrincipal principal = new AuthPrincipal(UUID.randomUUID(), "firebase-uid");
    UpsertDailyDistanceRequest body =
        new UpsertDailyDistanceRequest("2026-07-29", "manual", BigDecimal.TEN);

    ApiException ex = assertThrows(ApiException.class, () -> controller.upsert(principal, body));

    assertEquals(HttpStatus.NOT_FOUND, ex.status());
    assertEquals("fitness_sync_not_available", ex.code());
  }
}
