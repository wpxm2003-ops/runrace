package com.runrace.backend.auth.controller;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.auth.JwtService;
import com.runrace.backend.auth.dto.LanguageUpdateRequest;
import com.runrace.backend.auth.dto.LiveProgressSettingRequest;
import com.runrace.backend.auth.dto.LiveProgressSettingResponse;
import com.runrace.backend.auth.dto.LoginResponse;
import com.runrace.backend.auth.dto.MeResponse;
import com.runrace.backend.auth.dto.NicknameUpdateRequest;
import com.runrace.backend.auth.dto.NotificationSettingRequest;
import com.runrace.backend.auth.dto.NotificationSettingResponse;
import com.runrace.backend.auth.dto.PreferencesUpdateRequest;
import com.runrace.backend.auth.service.AccountService;
import com.runrace.backend.user.domain.AppUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class AuthController {

  private final AccountService accountService;
  private final JwtService jwtService;

  @PostMapping("/auth/login")
  public ResponseEntity<LoginResponse> login(AuthPrincipal principal) {
    AppUser user = accountService.getUser(principal.userId());
    String accessToken = jwtService.issue(principal);
    return ResponseEntity.ok(LoginResponse.from(user, accessToken));
  }

  @GetMapping("/me")
  public ResponseEntity<MeResponse> me(AuthPrincipal principal) {
    AppUser user = accountService.getUser(principal.userId());
    return ResponseEntity.ok(MeResponse.from(user));
  }

  @PatchMapping("/me/nickname")
  public ResponseEntity<MeResponse> updateNickname(
      AuthPrincipal principal, @RequestBody NicknameUpdateRequest body) {
    AppUser user = accountService.updateNickname(principal.userId(), body.nickname());
    return ResponseEntity.ok(MeResponse.from(user));
  }

  /**
   * @deprecated 언어·타임존을 함께 받는 {@code PATCH /me/preferences}로 대체됐다(2026-08-12).
   *     현재 웹/앱 클라이언트는 이 경로를 호출하지 않지만, 이미 배포된 구버전 앱이 아직
   *     호출하므로 남겨 둔다. 구버전 사용률이 충분히 떨어지면 이 메서드와
   *     {@code LanguageUpdateRequest}·{@code AccountService.updateLanguage}를 함께 제거할 것.
   */
  @Deprecated
  @PatchMapping("/me/language")
  public ResponseEntity<MeResponse> updateLanguage(
      AuthPrincipal principal, @RequestBody LanguageUpdateRequest body) {
    AppUser user = accountService.updateLanguage(principal.userId(), body.langCd());
    return ResponseEntity.ok(MeResponse.from(user));
  }

  @PatchMapping("/me/preferences")
  public ResponseEntity<MeResponse> updatePreferences(
      AuthPrincipal principal, @RequestBody PreferencesUpdateRequest body) {
    AppUser user = accountService.updatePreferences(
        principal.userId(), body.langCd(), body.timeZone());
    return ResponseEntity.ok(MeResponse.from(user));
  }

  @GetMapping("/me/notification-setting")
  public NotificationSettingResponse getNotificationSetting(AuthPrincipal principal) {
    return new NotificationSettingResponse(
        accountService.isPushEnabled(principal.userId()),
        accountService.hasDeviceToken(principal.userId()));
  }

  @PutMapping("/me/notification-setting")
  public ResponseEntity<Void> setNotificationSetting(
      AuthPrincipal principal, @RequestBody NotificationSettingRequest body) {
    accountService.updatePushEnabled(principal.userId(), body.enabled());
    return ResponseEntity.ok().build();
  }

  /** 실시간 진행률을 다른 사람에게 보여줄지 — 공개 레이스·크루 레이스 각각 설정한다. */
  @GetMapping("/me/live-progress-setting")
  public LiveProgressSettingResponse getLiveProgressSetting(AuthPrincipal principal) {
    return accountService.getLiveProgressSetting(principal.userId());
  }

  @PutMapping("/me/live-progress-setting")
  public ResponseEntity<Void> setLiveProgressSetting(
      AuthPrincipal principal, @RequestBody LiveProgressSettingRequest body) {
    accountService.updateLiveProgressSetting(
        principal.userId(), body.publicEnabled(), body.crewEnabled());
    return ResponseEntity.ok().build();
  }

  @DeleteMapping("/me")
  public ResponseEntity<Void> deleteAccount(AuthPrincipal principal) {
    accountService.deleteAccount(principal.userId());
    return ResponseEntity.noContent().build();
  }
}
