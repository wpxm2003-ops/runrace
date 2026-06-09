package com.runrace.backend.common;

import org.springframework.http.HttpStatus;

/**
 * 클라이언트에게 의미 있는 HTTP 상태 코드와 에러 코드로 전달되는 도메인 예외.
 *
 * <p>비즈니스 규칙 위반은 {@link RuntimeException} 대신 이 예외를 던진다. 각 정적 팩토리는
 * 상황에 맞는 HTTP 상태를 매핑하므로 호출부는 코드 문자열만 신경 쓰면 된다.
 * 응답 본문은 {@link ApiExceptionHandler}가 {@code {"error": code}} 형태로 직렬화한다.
 */
public class ApiException extends RuntimeException {
  private final HttpStatus status;
  private final String code;

  public ApiException(HttpStatus status, String code) {
    super(code);
    this.status = status;
    this.code = code;
  }

  public HttpStatus status() {
    return status;
  }

  public String code() {
    return code;
  }

  public static ApiException badRequest(String code) {
    return new ApiException(HttpStatus.BAD_REQUEST, code);
  }

  public static ApiException unauthorized(String code) {
    return new ApiException(HttpStatus.UNAUTHORIZED, code);
  }

  public static ApiException forbidden(String code) {
    return new ApiException(HttpStatus.FORBIDDEN, code);
  }

  public static ApiException notFound(String code) {
    return new ApiException(HttpStatus.NOT_FOUND, code);
  }

  public static ApiException conflict(String code) {
    return new ApiException(HttpStatus.CONFLICT, code);
  }

  /** 서버/인프라 실패를 안정적인 코드로 전달한다(외부 의존성 오류 등). */
  public static ApiException internal(String code) {
    return new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, code);
  }
}
