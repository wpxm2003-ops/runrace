package com.runrace.backend.auth.dto;

/**
 * 푸시 알림 수신 설정 조회 응답.
 *
 * @param enabled  사용자의 푸시 수신 선호(app_user.push_enabled)
 * @param hasToken 등록된 디바이스 토큰 유무 — false면 토글 불가(앱 푸시 미동의 상태)
 */
public record NotificationSettingResponse(boolean enabled, boolean hasToken) {}
