package com.runrace.backend.push;

import com.runrace.backend.auth.AuthContext;
import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.user.AppUser;
import com.runrace.backend.user.AppUserRepository;
import java.time.OffsetDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me")
@RequiredArgsConstructor
public class DeviceTokenController {
  private final AppUserRepository appUserRepository;
  private final DeviceTokenRepository deviceTokenRepository;

  @PostMapping("/device-tokens")
  public ResponseEntity<Void> upsert(@RequestBody UpsertDeviceTokenRequest body) {
    AuthPrincipal principal = AuthContext.getRequired();
    AppUser me = appUserRepository.findById(principal.userId()).orElseThrow();

    DeviceToken dt = new DeviceToken();
    dt.setUser(me);
    dt.setPlatform(body.platform());
    dt.setFcmToken(body.fcmToken());
    dt.setUpdatedAt(OffsetDateTime.now());
    deviceTokenRepository.save(dt);

    return ResponseEntity.ok().build();
  }

  public record UpsertDeviceTokenRequest(String platform, String fcmToken) {}
}

