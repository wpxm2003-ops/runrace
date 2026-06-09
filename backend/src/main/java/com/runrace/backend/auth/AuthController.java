package com.runrace.backend.auth;

import com.runrace.backend.auth.dto.LanguageUpdateRequest;
import com.runrace.backend.auth.dto.MeResponse;
import com.runrace.backend.auth.dto.NicknameUpdateRequest;
import com.runrace.backend.user.AppUser;
import com.runrace.backend.user.AppUserRepository;
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

  private final AppUserRepository appUserRepository;
  private final AccountService accountService;

  @PostMapping("/auth/login")
  public ResponseEntity<MeResponse> login(AuthPrincipal principal) {
    return me(principal);
  }

  @GetMapping("/me")
  public ResponseEntity<MeResponse> me(AuthPrincipal principal) {
    AppUser user = appUserRepository.getRequired(principal.userId());
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
