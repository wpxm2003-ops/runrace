package com.runrace.backend.push;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.push.dto.UpsertDeviceTokenRequest;
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
  public ResponseEntity<Void> upsert(
      AuthPrincipal principal, @RequestBody UpsertDeviceTokenRequest body) {
    DeviceToken token = new DeviceToken();
    token.setUser(appUserRepository.getReferenceById(principal.userId()));
    token.setPlatform(body.platform());
    token.setFcmToken(body.fcmToken());
    token.setUpdatedAt(OffsetDateTime.now());
    deviceTokenRepository.save(token);

    return ResponseEntity.ok().build();
  }
}
