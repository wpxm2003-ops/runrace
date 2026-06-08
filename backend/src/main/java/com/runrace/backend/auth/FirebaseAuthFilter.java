package com.runrace.backend.auth;

import com.google.firebase.FirebaseApp;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Optional;
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
  private static final Pattern CHALLENGE_DETAIL = Pattern.compile("^/api/challenges/[0-9]+$");
  private static final Pattern WORKOUT_SHARE = Pattern.compile("^/api/workouts/[0-9]+/share$");

  private final FirebaseUserService firebaseUserService;

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
      log.warn("Firebase token verification failed: {}", e.getMessage());
      unauthorized(response, "invalid_token");
    } catch (ServletException | IOException e) {
      throw e;
    } catch (Exception e) {
      log.error("Auth filter error on {}", request.getRequestURI(), e);
      unauthorized(response, "auth_failed");
    } finally {
      AuthContext.clear();
    }
  }

  /** 인증을 강제한다. 실패하면 401 에러 코드를 담아 반환, 성공하면 empty. */
  private Optional<String> authenticateRequired(HttpServletRequest request)
      throws FirebaseAuthException {
    if (FirebaseApp.getApps().isEmpty()) {
      return Optional.of("firebase_admin_not_initialized");
    }
    Optional<String> token = bearerToken(request);
    if (token.isEmpty()) {
      return Optional.of("missing_bearer_token");
    }
    authenticate(token.get());
    return Optional.empty();
  }

  /** 토큰이 유효하면 인증하고, 아니면 조용히 익명으로 통과시킨다. */
  private void authenticateOptionally(HttpServletRequest request) {
    if (FirebaseApp.getApps().isEmpty()) {
      return;
    }
    bearerToken(request)
        .ifPresent(
            token -> {
              try {
                authenticate(token);
              } catch (Exception e) {
                log.debug("Optional auth skipped for {}: {}", request.getRequestURI(), e.getMessage());
              }
            });
  }

  private void authenticate(String idToken) throws FirebaseAuthException {
    FirebaseToken decoded = FirebaseAuth.getInstance().verifyIdToken(idToken);
    AuthContext.set(firebaseUserService.upsertAndCreatePrincipal(decoded));
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
    return isPublicChallengeRead(request) || isClientErrorReport(request);
  }

  private boolean isPublicChallengeRead(HttpServletRequest request) {
    if (!"GET".equalsIgnoreCase(request.getMethod())) {
      return false;
    }
    String path = request.getRequestURI();
    return "/api/challenges".equals(path) || CHALLENGE_DETAIL.matcher(path).matches();
  }

  /** 프론트 에러 보고는 비로그인 상태에서도 보낼 수 있어야 한다. */
  private boolean isClientErrorReport(HttpServletRequest request) {
    return "POST".equalsIgnoreCase(request.getMethod())
        && "/api/client-errors".equals(request.getRequestURI());
  }

  private void unauthorized(HttpServletResponse response, String code) throws IOException {
    response.setStatus(401);
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    response.getWriter().write("{\"error\":\"unauthorized\",\"code\":\"" + code + "\"}");
  }
}
