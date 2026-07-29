package com.runrace.backend.fitness.controller;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.fitness.dto.UpsertDailyDistanceRequest;
import com.runrace.backend.fitness.dto.UpsertDailyDistanceResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Health Connect 등 외부 소스 일일 거리 동기화 — 프론트 연동 전까지 막아둔다.
 *
 * <p>라우트가 살아있으면 프론트 UI 없이도 유효한 인증 토큰만으로 누구나 직접 호출할 수
 * 있다. {@link com.runrace.backend.fitness.service.FitnessService}는 (1) source 문자열에
 * 화이트리스트가 없어 서로 다른 source로 반복 호출하면 매번 별개 레코드가 되어 상한이
 * 호출당으로만 걸리고 사용자 합산 상한이 없고, (2) 요청의 date가 레이스 반영 시점 판정에
 * 쓰이지 않아(항상 호출 시점 기준으로 활성 레이스에 반영) 임의 시점에 임의 거리를 주입해
 * 경품이 걸린 레이스의 완주·순위를 조작할 수 있는 치팅 경로였다. 실제로 연동을 열 때
 * source 화이트리스트·사용자+날짜 합산 상한·date 기준 반영 시점 검증을 갖추고 재개할 것.
 */
@RestController
@RequestMapping("/api/fitness")
public class FitnessController {

  @PostMapping("/daily-distance")
  public ResponseEntity<UpsertDailyDistanceResponse> upsert(
      AuthPrincipal principal, @RequestBody UpsertDailyDistanceRequest body) {
    throw ApiException.notFound("fitness_sync_not_available");
  }
}
