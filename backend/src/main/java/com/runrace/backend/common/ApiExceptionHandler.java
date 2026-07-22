package com.runrace.backend.common;

import com.runrace.backend.auth.AuthContext;
import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.observability.service.ErrorLogService;
import com.runrace.backend.observability.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import java.time.format.DateTimeParseException;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * 모든 컨트롤러 예외를 {@code {"error": code, "requestId": ...}} JSON 한 가지 형태로 직렬화한다.
 *
 * <p>도메인 예외는 자신이 가진 상태 코드로, 엔티티 조회 실패는 404로, 그 외 예기치 못한
 * 예외는 스택트레이스를 로그·DB(error_log)에 남기고 500으로 응답한다(내부 구현 노출 방지).
 * requestId는 사용자가 본 에러를 로그/DB 행과 연결하는 추적 키다.
 */
@RestControllerAdvice
@RequiredArgsConstructor
public class ApiExceptionHandler {
  private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

  private final ErrorLogService errorLogService;

  public record ApiError(String error, String requestId) {}

  /** 정상적인 비즈니스 플로우로 예상되는 에러 코드 — error_log 수집 제외. */
  private static final Set<String> EXPECTED_CODES = Set.of("nudge_daily_limit");

  @ExceptionHandler(ApiException.class)
  public ResponseEntity<ApiError> handleApiException(ApiException e, HttpServletRequest request) {
    if (!EXPECTED_CODES.contains(e.code())) {
      UUID userId = AuthContext.getOptional().map(AuthPrincipal::userId).orElse(null);
      errorLogService.recordApiError(
          e.code(),
          request.getMethod() + " " + request.getRequestURI(),
          userId,
          RequestIdFilter.current());
    }
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

  /** 잘못된 날짜/시간 형식(클라이언트 입력 파싱 실패)은 400으로(500·에러로그 방지). */
  @ExceptionHandler(DateTimeParseException.class)
  public ResponseEntity<ApiError> handleDateParse(DateTimeParseException e) {
    return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error("invalid_date_format"));
  }

  /**
   * 유니크 제약 경합 등 무결성 위반 — 동시 요청(예: 훈련 플랜 최초 저장 더블 서밋)으로 발생하며
   * 유니크 인덱스가 1행을 보장하므로 재시도(=update 경로)로 해결된다. 클라 상황이라 409(에러로그 제외).
   */
  @ExceptionHandler(DataIntegrityViolationException.class)
  public ResponseEntity<ApiError> handleDataIntegrity(DataIntegrityViolationException e) {
    return ResponseEntity.status(HttpStatus.CONFLICT).body(error("conflict"));
  }

  /**
   * API가 아닌 경로(루트 /, favicon 등) — 브라우저·도구의 부수 요청. 404만 반환하고 ERROR 로그는 남기지 않는다.
   */
  @ExceptionHandler(NoResourceFoundException.class)
  public ResponseEntity<ApiError> handleNoResource(NoResourceFoundException e) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error("not_found"));
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
