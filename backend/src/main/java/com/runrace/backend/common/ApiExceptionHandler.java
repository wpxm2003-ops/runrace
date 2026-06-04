package com.runrace.backend.common;

import java.util.NoSuchElementException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 모든 컨트롤러 예외를 {@code {"error": code}} JSON 한 가지 형태로 직렬화한다.
 *
 * <p>도메인 예외는 자신이 가진 상태 코드로, 엔티티 조회 실패는 404로, 그 외 예기치 못한
 * 예외는 스택트레이스를 로그에만 남기고 500으로 응답한다(내부 구현 노출 방지).
 */
@RestControllerAdvice
public class ApiExceptionHandler {
  private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

  public record ApiError(String error) {}

  @ExceptionHandler(ApiException.class)
  public ResponseEntity<ApiError> handleApiException(ApiException e) {
    return ResponseEntity.status(e.status()).body(new ApiError(e.code()));
  }

  /** {@code Optional.orElseThrow()} 등 엔티티 미존재. */
  @ExceptionHandler(NoSuchElementException.class)
  public ResponseEntity<ApiError> handleNotFound(NoSuchElementException e) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ApiError("not_found"));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<ApiError> handleUnexpected(Exception e) {
    log.error("Unhandled exception", e);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(new ApiError("internal_error"));
  }
}
