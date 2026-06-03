package com.runrace.backend.analytics;

import com.runrace.backend.auth.AuthContext;
import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.user.AppUserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/analytics")
@RequiredArgsConstructor
public class AnalyticsController {
  private final AppUserRepository appUserRepository;
  private final AnalyticsService analyticsService;

  @PostMapping("/events")
  public ResponseEntity<Void> track(@RequestBody TrackRequest body) {
    AuthPrincipal principal = AuthContext.getRequired();
    var user = appUserRepository.findById(principal.userId()).orElseThrow();
    analyticsService.track(user, body.name(), body.propsJson());
    return ResponseEntity.ok().build();
  }

  public record TrackRequest(String name, String propsJson) {}
}

