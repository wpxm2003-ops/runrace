package com.runrace.backend.observability.controller;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.observability.RequestIdFilter;
import com.runrace.backend.observability.service.ErrorLogService;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 프론트엔드 에러 수집 엔드포인트. 인증은 선택(비로그인도 보고 가능, 로그인 시 user_id 포함).
 * 항상 204를 돌려주어 보고 실패가 사용자 흐름에 영향을 주지 않게 한다.
 */
@RestController
@RequestMapping("/api/client-errors")
@RequiredArgsConstructor
public class ClientErrorController {
  private final ErrorLogService errorLogService;

  @PostMapping
  public ResponseEntity<Void> report(
      Optional<AuthPrincipal> principal, @RequestBody ClientErrorRequest body) {
    UUID userId = principal.map(AuthPrincipal::userId).orElse(null);
    errorLogService.recordFrontend(
        body.message(), body.stack(), buildContext(body), userId, RequestIdFilter.current());
    return ResponseEntity.noContent().build();
  }

  private static String buildContext(ClientErrorRequest body) {
    return "kind=" + nullToDash(body.kind())
        + " | url=" + nullToDash(body.url())
        + " | ua=" + nullToDash(body.userAgent());
  }

  private static String nullToDash(String value) {
    return value == null || value.isBlank() ? "-" : value;
  }

  public record ClientErrorRequest(
      String message, String stack, String url, String userAgent, String kind) {}
}
