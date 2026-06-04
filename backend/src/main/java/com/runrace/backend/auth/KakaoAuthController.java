package com.runrace.backend.auth;

import com.runrace.backend.auth.dto.KakaoLoginRequest;
import com.runrace.backend.auth.dto.KakaoLoginResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 카카오 로그인 엔드포인트.
 * Firebase 토큰 없이 호출되므로 {@link FirebaseAuthFilter}에서 인증을 건너뛴다.
 */
@RestController
@RequestMapping("/api/auth/kakao")
@RequiredArgsConstructor
public class KakaoAuthController {
  private final KakaoAuthService kakaoAuthService;

  @PostMapping
  public ResponseEntity<KakaoLoginResponse> login(@RequestBody KakaoLoginRequest body) {
    String customToken = kakaoAuthService.exchangeCodeForCustomToken(
        body.code(), body.redirectUri());
    return ResponseEntity.ok(new KakaoLoginResponse(customToken));
  }
}
