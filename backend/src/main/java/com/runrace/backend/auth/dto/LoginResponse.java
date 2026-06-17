package com.runrace.backend.auth.dto;

import com.runrace.backend.user.domain.AppUser;
import java.util.UUID;

/** 로그인 응답 — MeResponse 필드 + 자체 JWT 액세스 토큰. */
public record LoginResponse(
    UUID id,
    String firebaseUid,
    String email,
    String displayName,
    String nickname,
    String provider,
    String langCd,
    String accessToken) {

  public static LoginResponse from(AppUser user, String accessToken) {
    return new LoginResponse(
        user.getId(),
        user.getFirebaseUid(),
        user.getEmail(),
        user.getDisplayName(),
        user.getNickname(),
        user.getProvider(),
        user.getLangCd(),
        accessToken);
  }
}
