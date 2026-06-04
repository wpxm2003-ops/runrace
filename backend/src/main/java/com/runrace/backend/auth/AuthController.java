package com.runrace.backend.auth;

import com.runrace.backend.auth.dto.MeResponse;
import com.runrace.backend.user.AppUser;
import com.runrace.backend.user.AppUserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class AuthController {

  private final AppUserRepository appUserRepository;

  @PostMapping("/auth/login")
  public ResponseEntity<MeResponse> login(AuthPrincipal principal) {
    return me(principal);
  }

  @GetMapping("/me")
  public ResponseEntity<MeResponse> me(AuthPrincipal principal) {
    AppUser user = appUserRepository.getRequired(principal.userId());
    return ResponseEntity.ok(MeResponse.from(user));
  }
}

