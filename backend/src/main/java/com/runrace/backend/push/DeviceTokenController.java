package com.runrace.backend.push;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.push.dto.UpsertDeviceTokenRequest;
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
  private final DeviceTokenService deviceTokenService;

  @PostMapping("/device-tokens")
  public ResponseEntity<Void> upsert(
      AuthPrincipal principal, @RequestBody UpsertDeviceTokenRequest body) {
    deviceTokenService.upsert(principal.userId(), body.platform(), body.fcmToken());
    return ResponseEntity.ok().build();
  }
}
