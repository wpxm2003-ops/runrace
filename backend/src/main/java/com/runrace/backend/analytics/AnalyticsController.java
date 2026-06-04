package com.runrace.backend.analytics;

import com.runrace.backend.analytics.dto.TrackRequest;
import com.runrace.backend.auth.AuthPrincipal;
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
  private final AnalyticsService analyticsService;

  @PostMapping("/events")
  public ResponseEntity<Void> track(AuthPrincipal principal, @RequestBody TrackRequest body) {
    analyticsService.track(principal.userId(), body.name(), body.propsJson());
    return ResponseEntity.ok().build();
  }
}
