package com.runrace.backend.config;

import com.runrace.backend.auth.CurrentUserArgumentResolver;
import java.net.URI;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {
  private static final Logger log = LoggerFactory.getLogger(WebConfig.class);

  private final CurrentUserArgumentResolver currentUserArgumentResolver;

  @Override
  public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
    resolvers.add(currentUserArgumentResolver);
  }

  @Bean
  public CorsConfigurationSource corsConfigurationSource(
      @Value("${runrace.cors.allowed-origins}") String allowedOrigins) {
    List<String> patterns = expandOriginPatterns(allowedOrigins);
    log.info("CORS allowed origin patterns: {}", patterns);

    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedOriginPatterns(patterns);
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    config.setAllowedHeaders(List.of("*"));
    config.setMaxAge(3600L);

    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/**", config);
    return source;
  }

  /**
   * 개발용 호스트(localhost·IP 리터럴)에 한해 포트 와일드카드(:*)를 추가한다.
   * 프론트가 :8081 로 직접 호출하는 개발 편의를 위한 것이며,
   * 운영 도메인(예: runrace.co.kr)에는 임의 포트를 열지 않는다.
   */
  static List<String> expandOriginPatterns(String allowedOrigins) {
    Set<String> patterns = new LinkedHashSet<>();
    Arrays.stream(allowedOrigins.split(","))
        .map(String::trim)
        .filter(s -> !s.isEmpty())
        .forEach(
            origin -> {
              patterns.add(origin);
              try {
                URI uri = URI.create(origin);
                if (uri.getPort() == -1 && isDevHost(uri.getHost())) {
                  patterns.add(origin + ":*");
                }
              } catch (IllegalArgumentException ignored) {
                // keep exact origin only
              }
            });
    return List.copyOf(patterns);
  }

  /** localhost 또는 IPv4 리터럴만 개발 호스트로 간주(운영 도메인 제외). */
  private static boolean isDevHost(String host) {
    return host != null
        && (host.equals("localhost") || host.matches("\\d{1,3}(\\.\\d{1,3}){3}"));
  }
}
