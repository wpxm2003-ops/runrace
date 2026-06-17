package com.runrace.backend.auth.controller;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.auth.JwtService;
import com.runrace.backend.auth.dto.LanguageUpdateRequest;
import com.runrace.backend.auth.dto.LoginResponse;
import com.runrace.backend.auth.dto.MeResponse;
import com.runrace.backend.auth.dto.NicknameUpdateRequest;
import com.runrace.backend.auth.service.AccountService;
import com.runrace.backend.user.domain.AppUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
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

  @PatchMapping("/me/language")
  public ResponseEntity<MeResponse> updateLanguage(
      AuthPrincipal principal, @RequestBody LanguageUpdateRequest body) {
    AppUser user = accountService.updateLanguage(principal.userId(), body.langCd());
    return ResponseEntity.ok(MeResponse.from(user));
  }

  @DeleteMapping("/me")
  public ResponseEntity<Void> deleteAccount(AuthPrincipal principal) {
    accountService.deleteAccount(principal.userId());
    return ResponseEntity.noContent().build();
  }
}
