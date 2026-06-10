package com.runrace.backend.observability;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 에러를 {@code app_error_log} 테이블에 적재한다.
 *
 * <p>텔레메트리이므로 적재 실패가 원래 요청을 방해하면 안 된다. 모든 메서드는 예외를 삼키고,
 * 트랜잭션을 직접 열지 않아(레포지토리 호출이 자체 트랜잭션을 가짐) 실패 시 깨끗이 롤백된다.
 */
@Service
@RequiredArgsConstructor
public class ErrorLogService {
  private static final Logger log = LoggerFactory.getLogger(ErrorLogService.class);
  private static final int MAX_MESSAGE = 2_000;
  private static final int MAX_TEXT = 8_000;

  private final AppErrorLogRepository repository;

  /** 프론트엔드에서 보고한 에러. */
  public void recordFrontend(
      String message, String stack, String context, UUID userId, String requestId) {
    persist("frontend", message, stack, context, userId, requestId);
  }

  /** 백엔드에서 처리되지 않은 예외. */
  public void recordBackend(String message, String stack, String context, String requestId) {
    persist("backend", message, stack, context, null, requestId);
  }

  /** Throwable의 스택트레이스를 문자열로. */
  public static String stackTraceOf(Throwable t) {
    StringWriter sw = new StringWriter();
    t.printStackTrace(new PrintWriter(sw));
    return sw.toString();
  }

  private void persist(
      String source, String message, String stack, String context, UUID userId, String requestId) {
    try {
      repository.save(AppErrorLog.builder()
          .source(source)
          .message(truncate(message == null ? "(no message)" : message, MAX_MESSAGE))
          .stack(truncate(stack, MAX_TEXT))
          .context(truncate(context, MAX_TEXT))
          .userId(userId)
          .requestId(requestId)
          .createdAt(OffsetDateTime.now())
          .build());
    } catch (Exception e) {
      // 로그 적재 실패가 원래 흐름을 깨지 않도록 삼킨다.
      log.warn("Failed to persist error log: {}", e.getMessage());
    }
  }

  private static String truncate(String value, int max) {
    if (value == null) return null;
    return value.length() <= max ? value : value.substring(0, max);
  }
}
