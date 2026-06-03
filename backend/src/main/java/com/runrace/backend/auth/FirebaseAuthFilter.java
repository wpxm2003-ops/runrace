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

@Component
@RequiredArgsConstructor
public class FirebaseAuthFilter extends OncePerRequestFilter {
  private static final Logger log = LoggerFactory.getLogger(FirebaseAuthFilter.class);
  private static final Pattern CHALLENGE_DETAIL =
      Pattern.compile("^/api/challenges/[0-9]+$");

  private final FirebaseUserService firebaseUserService;

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
      return true;
    }
    String path = request.getRequestURI();
    return !path.startsWith("/api/") || path.startsWith("/api/public/");
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request,
      HttpServletResponse response,
      FilterChain filterChain
  ) throws ServletException, IOException {
    try {
      if (isPublicChallengeRead(request)) {
        tryAuthenticateOptional(request);
        filterChain.doFilter(request, response);
        return;
      }

      if (FirebaseApp.getApps().isEmpty()) {
        unauthorized(response, "firebase_admin_not_initialized");
        return;
      }

      String authHeader = Optional.ofNullable(request.getHeader(HttpHeaders.AUTHORIZATION)).orElse("");
      if (!authHeader.startsWith("Bearer ")) {
        unauthorized(response, "missing_bearer_token");
        return;
      }
      String idToken = authHeader.substring("Bearer ".length()).trim();
      if (idToken.isEmpty()) {
        unauthorized(response, "empty_bearer_token");
        return;
      }

      authenticateToken(idToken);
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

  private boolean isPublicChallengeRead(HttpServletRequest request) {
    if (!"GET".equalsIgnoreCase(request.getMethod())) {
      return false;
    }
    String path = request.getRequestURI();
    return "/api/challenges".equals(path) || CHALLENGE_DETAIL.matcher(path).matches();
  }

  private void tryAuthenticateOptional(HttpServletRequest request) {
    if (FirebaseApp.getApps().isEmpty()) {
      return;
    }
    String authHeader = Optional.ofNullable(request.getHeader(HttpHeaders.AUTHORIZATION)).orElse("");
    if (!authHeader.startsWith("Bearer ")) {
      return;
    }
    String idToken = authHeader.substring("Bearer ".length()).trim();
    if (idToken.isEmpty()) {
      return;
    }
    try {
      authenticateToken(idToken);
    } catch (Exception e) {
      log.debug("Optional auth skipped for {}: {}", request.getRequestURI(), e.getMessage());
    }
  }

  private void authenticateToken(String idToken) throws FirebaseAuthException {
    FirebaseToken decoded = FirebaseAuth.getInstance().verifyIdToken(idToken);
    AuthPrincipal principal = firebaseUserService.upsertAndCreatePrincipal(decoded);
    AuthContext.set(principal);
  }

  private void unauthorized(HttpServletResponse response, String code) throws IOException {
    response.setStatus(401);
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    response.getWriter().write("{\"error\":\"unauthorized\",\"code\":\"" + code + "\"}");
  }
}
