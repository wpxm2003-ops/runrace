package com.runrace.backend.auth.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.firebase.FirebaseApp;
import com.google.firebase.auth.FirebaseAuth;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.user.AppUser;
import com.runrace.backend.user.AppUserRepository;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * 카카오 OAuth 코드를 Firebase Custom Token으로 교환한다.
 *
 * <p>흐름:
 * <ol>
 *   <li>카카오 토큰 엔드포인트에서 authorization code → access token 교환</li>
 *   <li>카카오 사용자 정보 API로 프로필 조회</li>
 *   <li>app_user 테이블에 upsert (firebase_uid = "kakao:{kakaoId}")</li>
 *   <li>Firebase Admin SDK로 Custom Token 발급 → 프론트가 signInWithCustomToken으로 세션 생성</li>
 * </ol>
 */
@Service
public class KakaoAuthService {
  private static final Logger log = LoggerFactory.getLogger(KakaoAuthService.class);
  private static final String TOKEN_URL = "https://kauth.kakao.com/oauth/token";
  private static final String USERINFO_URL = "https://kapi.kakao.com/v2/user/me";

  @Value("${runrace.auth.kakao.rest-api-key:}")
  private String restApiKey;

  private final UserProvisioningService userProvisioningService;
  private final AppUserRepository appUserRepository;
  private final ObjectMapper objectMapper;
  private final HttpClient httpClient = HttpClient.newHttpClient();

  public KakaoAuthService(
      UserProvisioningService userProvisioningService,
      AppUserRepository appUserRepository,
      ObjectMapper objectMapper) {
    this.userProvisioningService = userProvisioningService;
    this.appUserRepository = appUserRepository;
    this.objectMapper = objectMapper;
  }

  /**
   * 카카오 authorization code를 받아 Firebase Custom Token을 반환한다.
   *
   * @throws ApiException 설정 오류 또는 카카오 API 실패 시
   */
  public String exchangeCodeForCustomToken(String code, String redirectUri) {
    if (restApiKey == null || restApiKey.isBlank()) {
      throw ApiException.badRequest("kakao_not_configured");
    }
    if (FirebaseApp.getApps().isEmpty()) {
      throw ApiException.badRequest("firebase_admin_not_initialized");
    }

    try {
      String accessToken = exchangeCode(code, redirectUri);
      KakaoUser kakaoUser = getUserInfo(accessToken);

      // 동일 이메일로 가입된 계정이 있으면 해당 계정으로 병합 로그인 (검증된 이메일일 때만 — 탈취 방지)
      if (kakaoUser.email() != null && kakaoUser.emailVerified()) {
        AppUser existing = appUserRepository.findByEmail(kakaoUser.email()).orElse(null);
        if (existing != null) {
          log.info("Kakao login merged into existing account [{}] by email", existing.getFirebaseUid());
          return FirebaseAuth.getInstance().createCustomToken(existing.getFirebaseUid());
        }
      }

      String firebaseUid = "kakao:" + kakaoUser.id();
      // 카카오는 사실상 한국 사용자 → 닉네임/언어 기본값 ko. 이후 LanguageSync가 lang_cd를 갱신한다.
      userProvisioningService.upsert(
          firebaseUid, kakaoUser.email(), kakaoUser.nickname(), "kakao", kakaoUser.emailVerified(), "ko");
      return FirebaseAuth.getInstance().createCustomToken(firebaseUid);
    } catch (ApiException e) {
      throw e;
    } catch (Exception e) {
      log.error("Kakao auth failed", e);
      throw ApiException.badRequest("kakao_auth_failed");
    }
  }

  /** authorization code → Kakao access token */
  private String exchangeCode(String code, String redirectUri) throws Exception {
    String body = "grant_type=authorization_code"
        + "&client_id=" + restApiKey
        + "&redirect_uri=" + URLEncoder.encode(redirectUri, StandardCharsets.UTF_8)
        + "&code=" + URLEncoder.encode(code, StandardCharsets.UTF_8);

    HttpRequest request = HttpRequest.newBuilder()
        .uri(URI.create(TOKEN_URL))
        .header("Content-Type", "application/x-www-form-urlencoded;charset=utf-8")
        .POST(HttpRequest.BodyPublishers.ofString(body))
        .build();

    HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
    JsonNode json = objectMapper.readTree(response.body());

    if (json.has("error")) {
      log.warn("Kakao token exchange error: {} — {}", json.path("error").asText(), json.path("error_description").asText());
      throw ApiException.badRequest("kakao_token_exchange_failed");
    }
    return json.get("access_token").asText();
  }

  /** Kakao access token → 사용자 프로필 */
  private KakaoUser getUserInfo(String accessToken) throws Exception {
    HttpRequest request = HttpRequest.newBuilder()
        .uri(URI.create(USERINFO_URL))
        .header("Authorization", "Bearer " + accessToken)
        .header("Content-Type", "application/x-www-form-urlencoded;charset=utf-8")
        .GET()
        .build();

    HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
    JsonNode json = objectMapper.readTree(response.body());

    if (json.has("code") && json.get("code").asInt() < 0) {
      log.warn("Kakao userinfo error: {} — {}", json.path("code").asText(), json.path("msg").asText());
      throw ApiException.badRequest("kakao_userinfo_failed");
    }

    JsonNode idNode = json.get("id");
    if (idNode == null) {
      log.warn("Kakao userinfo response missing 'id': {}", response.body());
      throw ApiException.badRequest("kakao_userinfo_failed");
    }

    String id = idNode.asText();
    JsonNode account = json.path("kakao_account");
    String email = account.path("email").asText(null);
    boolean emailVerified = account.path("is_email_verified").asBoolean(false);
    JsonNode profile = account.path("profile");
    String nickname = profile.path("nickname").asText(null);

    return new KakaoUser(id, email, nickname, emailVerified);
  }

  public record KakaoUser(String id, String email, String nickname, boolean emailVerified) {}
}
