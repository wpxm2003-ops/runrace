package com.runrace.backend.auth.dto;

import com.runrace.backend.user.domain.AppUser;
import java.util.UUID;

/** 로그인 응답 — MeResponse 필드 + 자체 JWT 액세스 토큰. JSON 구조는 평면 유지. */
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
    // AppUser→필드 매핑은 MeResponse.from 한 곳에만 둔다(필드 추가/변경 시 동기화 비용 제거).
    MeResponse me = MeResponse.from(user);
    return new LoginResponse(
        me.id(),
        me.firebaseUid(),
        me.email(),
        me.displayName(),
        me.nickname(),
        me.provider(),
        me.langCd(),
        accessToken);
  }
}
