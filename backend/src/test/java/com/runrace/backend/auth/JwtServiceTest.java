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
  private static final String SECRET = "test-secret-key-for-jwt-at-least-32-bytes!";

  private final JwtService service = new JwtService(SECRET, 7);

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

  /**
   * 만료 검증. 예전에는 expiryDays=0으로 "발급 즉시 만료 경계"를 노려 verify를 호출만 하고
   * 아무것도 단정하지 않았다 — 만료가 아예 검사되지 않아도 통과하는 공허한 테스트였다.
   * 경계 대신 확실히 지난 시각(-1일)을 쓰고, 시크릿이 같은 인스턴스로 검증해
   * empty의 이유가 서명 불일치가 아니라 만료임을 보장한다.
   */
  @Test void 만료된_토큰이면_empty() {
    JwtService expired = new JwtService(SECRET, -1);
    String token = expired.issue(principal());

    // 서명은 맞다 — 같은 시크릿으로 발급했으므로 empty의 원인은 만료뿐이다.
    assertTrue(service.verify(token).isEmpty());
  }

  /** 아직 만료되지 않은 토큰은 통과해야 한다 — 위 테스트가 항상 empty라서 통과하는 것이 아님을 보인다. */
  @Test void 만료_전_토큰은_present() {
    JwtService longLived = new JwtService(SECRET, 7);

    assertTrue(service.verify(longLived.issue(principal())).isPresent());
  }
}
