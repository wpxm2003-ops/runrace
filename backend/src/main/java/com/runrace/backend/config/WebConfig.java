package com.runrace.backend.config;

import java.net.URI;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class WebConfig {
  private static final Logger log = LoggerFactory.getLogger(WebConfig.class);

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
   * http://98.94.84.40 → http://98.94.84.40:* (80·8081 등) 프론트가 :8081 로 직접 호출해도 허용
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
                if (uri.getPort() == -1 && uri.getHost() != null) {
                  patterns.add(origin + ":*");
                }
              } catch (IllegalArgumentException ignored) {
                // keep exact origin only
              }
            });
    return List.copyOf(patterns);
  }
}
