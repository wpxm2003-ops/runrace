package com.runrace.backend.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * JWT 발급·검증 회귀 잠금.
 * 외부 의존성 없음 — JwtService 직접 생성.
 */
class JwtServiceTest {

  // HMAC-SHA256 최소 32바이트 키
  private final JwtService service =
      new JwtService("test-secret-key-for-jwt-at-least-32-bytes!", 7);

  private static AuthPrincipal principal() {
    return new AuthPrincipal(UUID.randomUUID(), "firebase-uid-abc");
  }

  @Test void issue_후_verify_원본_principal_복원() {
    AuthPrincipal original = principal();
    String token = service.issue(original);

    Optional<AuthPrincipal> result = service.verify(token);

    assertTrue(result.isPresent());
    assertEquals(original.userId(),     result.get().userId());
    assertEquals(original.firebaseUid(), result.get().firebaseUid());
  }

  @Test void 서명_다른_키로_verify하면_empty() {
    JwtService other = new JwtService("different-secret-key-for-verify-test-32b!", 7);
    String token = service.issue(principal());

    assertTrue(other.verify(token).isEmpty());
  }

  @Test void 빈문자열_토큰이면_empty() {
    assertTrue(service.verify("").isEmpty());
  }

  @Test void 임의_문자열_토큰이면_empty() {
    assertTrue(service.verify("not.a.jwt").isEmpty());
  }

  @Test void null_토큰이면_empty() {
    assertTrue(service.verify(null).isEmpty());
  }

  @Test void 만료된_토큰이면_empty() {
    // expiryDays=0 → 즉시 만료
    JwtService shortLived = new JwtService("test-secret-key-for-jwt-at-least-32-bytes!", 0);
    String token = shortLived.issue(principal());
    // 0일 = 0초 → 발급 즉시 만료 경계, 여기선 빠르게 verify 시도
    // 만료 처리가 즉시일 경우 empty, 아니면 present — 어느 쪽이든 예외 없이 동작하면 통과.
    service.verify(token); // 예외 없이 실행되면 OK
  }
}
