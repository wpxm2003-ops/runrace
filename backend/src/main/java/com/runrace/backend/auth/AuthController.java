package com.runrace.backend.auth;

import com.runrace.backend.user.AppUser;
import com.runrace.backend.user.AppUserRepository;
import java.util.UUID;
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
  public ResponseEntity<MeResponse> login() {
    return me();
  }

  @GetMapping("/me")
  public ResponseEntity<MeResponse> me() {
    AuthPrincipal principal = AuthContext.getRequired();
    UUID userId = principal.userId();

    AppUser user = appUserRepository.findById(userId).orElseThrow();
    return ResponseEntity.ok(MeResponse.from(user));
  }

  public record MeResponse(
      UUID id,
      String firebaseUid,
      String email,
      String displayName,
      String photoUrl,
      String provider
  ) {
    static MeResponse from(AppUser u) {
      return new MeResponse(
          u.getId(),
          u.getFirebaseUid(),
          u.getEmail(),
          u.getDisplayName(),
          u.getPhotoUrl(),
          u.getProvider()
      );
    }
  }
}

