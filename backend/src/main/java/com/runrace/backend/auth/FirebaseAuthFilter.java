package com.runrace.backend.auth;

import com.google.firebase.ErrorCode;
import com.google.firebase.FirebaseApp;
import com.google.firebase.auth.AuthErrorCode;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import com.runrace.backend.auth.service.FirebaseUserService;
import com.runrace.backend.common.PathPatterns;
import com.runrace.backend.observability.RequestIdFilter;
import com.runrace.backend.observability.service.ErrorLogService;
import com.runrace.backend.user.repository.AppUserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 모든 {@code /api/**} 요청(공개 경로 제외)에 Firebase ID 토큰 인증을 적용한다.
 *
 * <p>인증에 성공하면 {@link AuthContext}에 주체를 심고, 요청 종료 시 항상 비운다.
 * 공개 챌린지 조회({@code GET /api/challenges}, {@code GET /api/challenges/{id}})는
 * 토큰이 있으면 선택적으로 인증해 "내 소유 여부" 같은 부가 정보를 노출한다.
 */
@Component
@RequiredArgsConstructor
public class FirebaseAuthFilter extends OncePerRequestFilter {
  private static final Logger log = LoggerFactory.getLogger(FirebaseAuthFilter.class);
  private static final String BEARER_PREFIX = "Bearer ";
  private static final Pattern CHALLENGE_DETAIL =
      Pattern.compile("^/api/challenges/" + PathPatterns.ID + "$");
  private static final Pattern CHALLENGE_WORKOUTS =
      Pattern.compile("^/api/challenges/" + PathPatterns.ID + "/workouts$");
  /** 경품명 목록은 전체 공개(이미지는 별도 게이트 엔드포인트). */
  private static final Pattern CHALLENGE_PRIZES =
      Pattern.compile("^/api/challenges/" + PathPatterns.ID + "/prizes$");
  private static final Pattern WORKOUT_SHARE =
      Pattern.compile("^/api/workouts/" + PathPatterns.ID + "/share$");
  /** NSM 블록(직전 재측정→이번 재측정) 리포트 — 링크 공유용, 사용자 식별 정보 미포함. */
  private static final Pattern NSM_BLOCK_REPORT =
      Pattern.compile("^/api/training-plan/report/" + PathPatterns.ID + "$");
  private static final Pattern CHALLENGE_SHARE_PAGE =
      Pattern.compile("^/api/share/challenges/" + PathPatterns.ID + "$");
  /** 크루 발견 목록·공개 상세 — 비회원도 구경 가능, 로그인 상태면 내 신청 상태를 함께 내려준다. */
  private static final Pattern CREW_DETAIL =
      Pattern.compile("^/api/crews/" + PathPatterns.ID + "$");

  private final FirebaseUserService firebaseUserService;
  private final JwtService jwtService;
  private final ErrorLogService errorLogService;
  private final AppUserRepository appUserRepository;

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
      return true;
    }
    String path = request.getRequestURI();
    // 카카오 로그인은 Firebase 토큰 없이 호출되는 공개 엔드포인트
    if ("POST".equalsIgnoreCase(request.getMethod()) && "/api/auth/kakao".equals(path)) {
      return true;
    }
    if ("GET".equalsIgnoreCase(request.getMethod()) && WORKOUT_SHARE.matcher(path).matches()) {
      return true;
    }
    if ("GET".equalsIgnoreCase(request.getMethod()) && NSM_BLOCK_REPORT.matcher(path).matches()) {
      return true;
    }
    if ("GET".equalsIgnoreCase(request.getMethod()) && CHALLENGE_SHARE_PAGE.matcher(path).matches()) {
      return true;
    }
    // 업로드 이미지 서빙은 공개
    if ("GET".equalsIgnoreCase(request.getMethod()) && path.startsWith("/api/uploads/")) {
      return true;
    }
    return !path.startsWith("/api/") || path.startsWith("/api/public/");
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    try {
      if (isOptionalAuthEndpoint(request)) {
        authenticateOptionally(request);
        filterChain.doFilter(request, response);
        return;
      }

      Optional<String> authError = authenticateRequired(request);
      if (authError.isPresent()) {
        unauthorized(response, authError.get());
        return;
      }
      filterChain.doFilter(request, response);
    } catch (FirebaseAuthException e) {
      logTokenFailure(e, request);
      unauthorized(response, "invalid_token");
    } catch (ServletException | IOException e) {
      throw e;
    } catch (Exception e) {
      logUnexpectedFailure(e, request);
      unauthorized(response, "auth_failed");
    } finally {
      AuthContext.clear();
    }
  }

  private void logTokenFailure(FirebaseAuthException e, HttpServletRequest request) {
    // 만료·폐기·형식 오류 토큰은 세션이 오래된 정상 상황(재로그인하면 해결)이라 수집하지 않는다.
    // 구글 인증서 조회 실패 등 인프라 장애만 남긴다 — 그것만 우리가 조치할 수 있는 문제다.
    if (isInfraFailure(e)) {
      log.warn("Firebase token verification failed: {}", e.getMessage());
      errorLogService.recordServiceError(
          "firebase",
          e.getErrorCode() != null ? e.getErrorCode().name() : "UNKNOWN",
          e.getMessage(), null,
          request.getMethod() + " " + request.getRequestURI() + " | req:" + RequestIdFilter.current());
    } else {
      log.debug("Firebase token rejected: {}", e.getMessage());
    }
  }

  private void logUnexpectedFailure(Exception e, HttpServletRequest request) {
    log.error("Auth filter error on {}", request.getRequestURI(), e);
    errorLogService.recordServiceError(
        "firebase", "auth_filter_error", e.getMessage(),
        ErrorLogService.stackTraceOf(e),
        request.getMethod() + " " + request.getRequestURI() + " | req:" + RequestIdFilter.current());
  }

  /** 인증을 강제한다. 실패하면 401 에러 코드를 담아 반환, 성공하면 empty. */
  private Optional<String> authenticateRequired(HttpServletRequest request)
      throws FirebaseAuthException {
    Optional<String> token = bearerToken(request);
    if (token.isEmpty()) {
      return Optional.of("missing_bearer_token");
    }
    return authenticate(token.get(), preferredLang(request));
  }

  /** 토큰이 유효하면 인증하고, 아니면 조용히 익명으로 통과시킨다. */
  private void authenticateOptionally(HttpServletRequest request) {
    bearerToken(request)
        .ifPresent(
            token -> {
              try {
                authenticate(token, preferredLang(request));
              } catch (Exception e) {
                log.debug("Optional auth skipped for {}: {}", request.getRequestURI(), e.getMessage());
              }
            });
  }

  /**
   * 토큰으로 인증한다. 실패 사유 코드를 돌려주고, 성공이면 빈 값이다.
   *
   * <p>Firebase Admin 초기화 여부는 <b>폴백 직전에만</b> 본다. 예전에는 진입부에서 먼저
   * 검사해서, 로컬 HMAC 검증만으로 끝나는 자체 JWT 보유자까지 Admin 초기화 실패 하나로
   * 전부 401이 됐다 — 기존 로그인 사용자를 살릴 수 있는 상황에서 못 살리는 구조였다.
   * 자체 JWT 검증은 서명·발급자·클레임을 모두 확인하고 어떤 예외도 빈 값으로 떨어뜨리므로
   * (JwtService.verify), 순서를 바꿔도 통과 조건은 그대로다.
   */
  private Optional<String> authenticate(String token, String langHint)
      throws FirebaseAuthException {
    // 자체 JWT는 Firebase 네트워크 없이 검증하되, 현재도 같은 활성 계정인지는 로컬 DB에서
    // 확인한다. 서명만 확인하면 탈퇴 직전에 발급한 토큰이 만료일까지 계속 살아남는다.
    var jwtPrincipal = jwtService.verify(token);
    if (jwtPrincipal.isPresent()) {
      var principal = jwtPrincipal.get();
      if (!appUserRepository.existsByIdAndFirebaseUidAndWithdrawnAtIsNull(
          principal.userId(), principal.firebaseUid())) {
        return Optional.of("account_inactive");
      }
      AuthContext.set(principal);
      return Optional.empty();
    }
    // Firebase ID 토큰 폴백 (최초 로그인, 토큰 만료 후 재발급 시)
    if (FirebaseApp.getApps().isEmpty()) {
      return Optional.of("firebase_admin_not_initialized");
    }
    FirebaseToken decoded = FirebaseAuth.getInstance().verifyIdToken(token);
    AuthContext.set(firebaseUserService.upsertAndCreatePrincipal(decoded, langHint));
    return Optional.empty();
  }

  /** 최초 가입 시 닉네임·언어 추정에 쓸 Accept-Language 기본 언어. (기존 사용자에겐 무시됨) */
  private String preferredLang(HttpServletRequest request) {
    return request.getLocale().getLanguage();
  }

  private Optional<String> bearerToken(HttpServletRequest request) {
    String header = Optional.ofNullable(request.getHeader(HttpHeaders.AUTHORIZATION)).orElse("");
    if (!header.startsWith(BEARER_PREFIX)) {
      return Optional.empty();
    }
    String token = header.substring(BEARER_PREFIX.length()).trim();
    return token.isEmpty() ? Optional.empty() : Optional.of(token);
  }

  /** 토큰이 있으면 인증하되 없어도 통과시키는 엔드포인트. */
  private boolean isOptionalAuthEndpoint(HttpServletRequest request) {
    return isPublicChallengeRead(request) || isPublicCrewRead(request) || isClientErrorReport(request);
  }

  private boolean isPublicChallengeRead(HttpServletRequest request) {
    if (!"GET".equalsIgnoreCase(request.getMethod())) {
      return false;
    }
    String path = request.getRequestURI();
    return "/api/challenges".equals(path)
        || CHALLENGE_DETAIL.matcher(path).matches()
        || CHALLENGE_WORKOUTS.matcher(path).matches()
        || CHALLENGE_PRIZES.matcher(path).matches();
  }

  /** 크루 발견 목록(/api/crews/discover)·공개 상세(/api/crews/{id})는 비회원도 조회 가능. */
  private boolean isPublicCrewRead(HttpServletRequest request) {
    if (!"GET".equalsIgnoreCase(request.getMethod())) {
      return false;
    }
    String path = request.getRequestURI();
    return "/api/crews/discover".equals(path) || CREW_DETAIL.matcher(path).matches();
  }

  /** 프론트 에러 보고는 비로그인 상태에서도 보낼 수 있어야 한다. */
  private boolean isClientErrorReport(HttpServletRequest request) {
    return "POST".equalsIgnoreCase(request.getMethod())
        && "/api/client-errors".equals(request.getRequestURI());
  }

  /** 우리가 조치할 수 있는 인프라 장애로 볼 Firebase 오류 등급. 토큰 자체 문제는 여기 없다. */
  private static final Set<ErrorCode> INFRA_ERROR_CODES = Set.of(
      ErrorCode.INTERNAL, ErrorCode.UNAVAILABLE, ErrorCode.DEADLINE_EXCEEDED, ErrorCode.UNKNOWN);

  /**
   * 인증 실패가 인프라 장애인지(= error_log에 남길 가치가 있는지).
   * 만료·폐기·형식 오류 토큰은 false — 유저가 재로그인하면 끝나는 정상 흐름이다.
   */
  private static boolean isInfraFailure(FirebaseAuthException e) {
    if (e.getAuthErrorCode() == AuthErrorCode.CERTIFICATE_FETCH_FAILED) return true;
    ErrorCode code = e.getErrorCode();
    return code != null && INFRA_ERROR_CODES.contains(code);
  }

  private void unauthorized(HttpServletResponse response, String code) throws IOException {
    response.setStatus(401);
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    response.getWriter().write("{\"error\":\"unauthorized\",\"code\":\"" + code + "\"}");
  }
}
