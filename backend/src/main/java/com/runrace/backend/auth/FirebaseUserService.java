package com.runrace.backend.auth;

import com.google.firebase.auth.FirebaseToken;
import com.runrace.backend.config.CacheConfig;
import com.runrace.backend.user.AppUser;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class FirebaseUserService {
  private final UserProvisioningService userProvisioningService;

  /**
   * firebaseUid 기준으로 인증 주체를 캐시한다(TTL은 {@link CacheConfig}).
   * 캐시 히트 시 user 프로비저닝(DB upsert 트랜잭션)을 건너뛴다 — 매 요청 DB 부하 제거(H1).
   * 캐시 미스(최초·TTL 만료)에만 upsert가 실행돼 신규 사용자 생성·프로필 갱신을 보장한다.
   */
  @Cacheable(cacheNames = CacheConfig.AUTH_PRINCIPALS, key = "#token.uid")
  public AuthPrincipal upsertAndCreatePrincipal(FirebaseToken token, String langHint) {
    AppUser saved =
        userProvisioningService.upsert(
            token.getUid(),
            token.getEmail(),
            token.getName(),
            extractSignInProvider(token).orElse(null),
            langHint);
    return new AuthPrincipal(saved.getId(), saved.getFirebaseUid());
  }

  private Optional<String> extractSignInProvider(FirebaseToken token) {
    Object firebaseClaim = token.getClaims().get("firebase");
    if (!(firebaseClaim instanceof Map<?, ?> firebaseMap)) {
      return Optional.empty();
    }
    Object provider = firebaseMap.get("sign_in_provider");
    if (provider == null) {
      return Optional.empty();
    }
    return Optional.of(String.valueOf(provider));
  }
}
