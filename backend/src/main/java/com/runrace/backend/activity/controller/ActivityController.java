package com.runrace.backend.activity.controller;

import com.runrace.backend.activity.service.DailyActiveService;
import com.runrace.backend.auth.AuthPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/activity")
@RequiredArgsConstructor
public class ActivityController {
  private final DailyActiveService dailyActiveService;

  /**
   * 일일 활성 핑 — 앱 부팅·포그라운드 복귀 때 클라이언트가 하루 한 번 부른다. 인증 필수.
   * 같은 날 같은 플랫폼으로 다시 와도 행이 늘지 않는다(recorded=false).
   */
  @PostMapping("/ping")
  public PingResponse ping(AuthPrincipal principal, @RequestBody PingRequest body) {
    var result = dailyActiveService.recordPing(principal.userId(), body.platform());
    return new PingResponse(result.localDate().toString(), result.recorded());
  }

  /** @param platform android_app | web | ios_web */
  public record PingRequest(String platform) {}

  /** @param localDate 서버가 기록한 사용자 현지 날짜(yyyy-MM-dd) */
  public record PingResponse(String localDate, boolean recorded) {}
}
