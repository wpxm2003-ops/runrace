package com.runrace.backend.observability;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 요청마다 짧은 상관관계 ID를 발급한다.
 *
 * <ul>
 *   <li>MDC({@code requestId})에 넣어 모든 로그 줄에 함께 찍히게 한다.
 *   <li>응답 헤더 {@code X-Request-Id}로 내려, 에러 응답 본문의 requestId와 짝을 이룬다.
 * </ul>
 *
 * 인증 필터보다 먼저 돌도록 가장 높은 우선순위로 등록한다.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {
  public static final String HEADER = "X-Request-Id";
  public static final String MDC_KEY = "requestId";

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    String requestId = newId();
    MDC.put(MDC_KEY, requestId);
    response.setHeader(HEADER, requestId);
    try {
      filterChain.doFilter(request, response);
    } finally {
      MDC.remove(MDC_KEY);
    }
  }

  /** 사용자가 에러 화면에서 그대로 불러줄 수 있도록 짧게(8자). */
  private static String newId() {
    return UUID.randomUUID().toString().substring(0, 8);
  }

  /** 현재 요청 스레드의 상관관계 ID(없으면 null). */
  public static String current() {
    return MDC.get(MDC_KEY);
  }
}
