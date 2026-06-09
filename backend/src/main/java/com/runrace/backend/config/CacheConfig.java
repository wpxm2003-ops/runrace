package com.runrace.backend.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import java.time.Duration;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 애플리케이션 캐시 설정.
 *
 * <p>{@link #AUTH_PRINCIPALS}: firebaseUid → 인증 주체 매핑 캐시. 매 {@code /api/**} 요청마다
 * 발생하던 user upsert 트랜잭션(H1)을 제거한다. 캐시된 값은 (userId, firebaseUid) 불변 식별자라
 * TTL 동안 안전하다. 이메일·표시이름 등 프로필 필드 갱신은 최대 TTL만큼 지연될 수 있다.
 */
@Configuration
@EnableCaching
public class CacheConfig {
  /** 인증 주체 캐시 이름. */
  public static final String AUTH_PRINCIPALS = "authPrincipals";

  @Bean
  public CacheManager cacheManager() {
    CaffeineCacheManager manager = new CaffeineCacheManager(AUTH_PRINCIPALS);
    manager.setCaffeine(
        Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMinutes(10))
            .maximumSize(50_000));
    return manager;
  }
}
