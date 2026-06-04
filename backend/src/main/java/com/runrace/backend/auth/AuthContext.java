package com.runrace.backend.auth;

import java.util.Optional;

/**
 * 요청 스레드에 묶인 인증 주체 저장소.
 *
 * <p>{@link FirebaseAuthFilter}가 채우고 비우며, {@link CurrentUserArgumentResolver}가 읽어
 * 컨트롤러 파라미터로 주입한다. 컨트롤러가 직접 접근할 일은 없다.
 */
public final class AuthContext {
  private static final ThreadLocal<AuthPrincipal> PRINCIPAL = new ThreadLocal<>();

  private AuthContext() {}

  public static void set(AuthPrincipal principal) {
    PRINCIPAL.set(principal);
  }

  public static Optional<AuthPrincipal> getOptional() {
    return Optional.ofNullable(PRINCIPAL.get());
  }

  public static void clear() {
    PRINCIPAL.remove();
  }
}
