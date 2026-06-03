package com.runrace.backend.fitness;

import com.runrace.backend.auth.AuthContext;
import com.runrace.backend.auth.AuthPrincipal;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/fitness")
@RequiredArgsConstructor
public class FitnessController {
  private final FitnessService fitnessService;
  private final com.runrace.backend.push.PushService pushService;
  private final com.runrace.backend.challenge.ChallengeMemberRepository challengeMemberRepository;

  @PostMapping("/daily-distance")
  public ResponseEntity<UpsertDailyDistanceResponse> upsert(@RequestBody UpsertDailyDistanceRequest body) {
    AuthPrincipal principal = AuthContext.getRequired();
    FitnessService.UpsertResult r =
        fitnessService.upsertDailyDistance(
            principal,
            LocalDate.parse(body.date()),
            body.source(),
            body.distanceKm()
        );
    // 기록 반영 알림(같은 대결 멤버에게 best-effort)
    var myActive = challengeMemberRepository.findAllActiveForUser(principal.userId(), OffsetDateTime.now());
    for (var cm : myActive) {
      var members = challengeMemberRepository.findAllForChallenge(cm.getChallenge().getId());
      for (var other : members) {
        if (!other.getUser().getId().equals(principal.userId())) {
          pushService.sendToUserTokens(other.getUser().getId(), "RunRace", "오늘 기록이 대결에 반영됐어요.");
        }
      }
    }
    return ResponseEntity.ok(new UpsertDailyDistanceResponse(r.prevKm(), r.nowKm(), r.deltaKm()));
  }

  public record UpsertDailyDistanceRequest(String date, String source, BigDecimal distanceKm) {}

  public record UpsertDailyDistanceResponse(BigDecimal prevKm, BigDecimal nowKm, BigDecimal deltaKm) {}
}

