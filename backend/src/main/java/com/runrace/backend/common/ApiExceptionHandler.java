package com.runrace.backend.common;

import com.runrace.backend.observability.ErrorLogService;
import com.runrace.backend.observability.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import java.util.NoSuchElementException;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 모든 컨트롤러 예외를 {@code {"error": code, "requestId": ...}} JSON 한 가지 형태로 직렬화한다.
 *
 * <p>도메인 예외는 자신이 가진 상태 코드로, 엔티티 조회 실패는 404로, 그 외 예기치 못한
 * 예외는 스택트레이스를 로그·DB(app_error_log)에 남기고 500으로 응답한다(내부 구현 노출 방지).
 * requestId는 사용자가 본 에러를 로그/DB 행과 연결하는 추적 키다.
 */
@RestControllerAdvice
@RequiredArgsConstructor
public class ApiExceptionHandler {
  private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

  private final ErrorLogService errorLogService;

  public record ApiError(String error, String requestId) {}

  @ExceptionHandler(ApiException.class)
  public ResponseEntity<ApiError> handleApiException(ApiException e) {
    return ResponseEntity.status(e.status()).body(error(e.code()));
  }

  /** {@code Optional.orElseThrow()} 등 엔티티 미존재. */
  @ExceptionHandler(NoSuchElementException.class)
  public ResponseEntity<ApiError> handleNotFound(NoSuchElementException e) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error("not_found"));
  }

  /** 잘못된/깨진 요청 본문은 클라이언트 실수이므로 400으로(에러 로그에 적재하지 않음). */
  @ExceptionHandler(HttpMessageNotReadableException.class)
  public ResponseEntity<ApiError> handleUnreadable(HttpMessageNotReadableException e) {
    return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error("malformed_request"));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<ApiError> handleUnexpected(Exception e, HttpServletRequest request) {
    String requestId = RequestIdFilter.current();
    log.error("Unhandled exception [req:{}]", requestId, e);
    errorLogService.recordBackend(
        e.toString(),
        ErrorLogService.stackTraceOf(e),
        request.getMethod() + " " + request.getRequestURI(),
        requestId);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(new ApiError("internal_error", requestId));
  }

  private static ApiError error(String code) {
    return new ApiError(code, RequestIdFilter.current());
  }
}
