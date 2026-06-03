package com.runrace.backend.auth;

import java.util.Optional;
import java.util.UUID;

public final class AuthContext {
  private static final ThreadLocal<AuthPrincipal> PRINCIPAL = new ThreadLocal<>();

  private AuthContext() {}

  public static void set(AuthPrincipal principal) {
    PRINCIPAL.set(principal);
  }

  public static Optional<AuthPrincipal> getOptional() {
    return Optional.ofNullable(PRINCIPAL.get());
  }

  public static Optional<UUID> userId() {
    return getOptional().map(AuthPrincipal::userId);
  }

  public static AuthPrincipal getRequired() {
    AuthPrincipal p = PRINCIPAL.get();
    if (p == null) throw new IllegalStateException("Unauthenticated");
    return p;
  }

  public static void clear() {
    PRINCIPAL.remove();
  }
}
