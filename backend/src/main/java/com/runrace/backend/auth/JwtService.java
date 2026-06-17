package com.runrace.backend.auth;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * 자체 JWT 액세스 토큰 발급·검증.
 * Firebase ID 토큰 대신 이 토큰을 사용하면 Google 네트워크 검증 없이 로컬 HMAC으로 즉시 인증된다.
 */
@Service
public class JwtService {

  private static final String ISSUER = "runrace";
  private static final String FIREBASE_UID_CLAIM = "fuid";

  private final SecretKey key;
  private final long expirySeconds;

  public JwtService(
      @Value("${runrace.auth.jwt.secret}") String secret,
      @Value("${runrace.auth.jwt.expiry-days:7}") long expiryDays) {
    this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    this.expirySeconds = expiryDays * 86400L;
  }

  /** 로그인 성공 후 클라이언트에 발급할 액세스 토큰을 생성한다. */
  public String issue(AuthPrincipal principal) {
    Instant now = Instant.now();
    return Jwts.builder()
        .issuer(ISSUER)
        .subject(principal.userId().toString())
        .claim(FIREBASE_UID_CLAIM, principal.firebaseUid())
        .issuedAt(Date.from(now))
        .expiration(Date.from(now.plusSeconds(expirySeconds)))
        .signWith(key)
        .compact();
  }

  /**
   * 토큰을 검증하고 {@link AuthPrincipal}을 반환한다.
   * 서명 불일치·만료·형식 오류 등 모든 예외는 {@link Optional#empty()}로 처리한다.
   */
  public Optional<AuthPrincipal> verify(String token) {
    try {
      Claims claims = Jwts.parser()
          .verifyWith(key)
          .build()
          .parseSignedClaims(token)
          .getPayload();

      if (!ISSUER.equals(claims.getIssuer())) {
        return Optional.empty();
      }
      UUID userId = UUID.fromString(claims.getSubject());
      String firebaseUid = claims.get(FIREBASE_UID_CLAIM, String.class);
      if (firebaseUid == null) {
        return Optional.empty();
      }
      return Optional.of(new AuthPrincipal(userId, firebaseUid));
    } catch (Exception e) {
      return Optional.empty();
    }
  }
}
