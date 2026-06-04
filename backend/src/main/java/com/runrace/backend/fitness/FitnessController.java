package com.runrace.backend.fitness;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.fitness.dto.UpsertDailyDistanceRequest;
import com.runrace.backend.fitness.dto.UpsertDailyDistanceResponse;
import java.time.LocalDate;
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

  @PostMapping("/daily-distance")
  public ResponseEntity<UpsertDailyDistanceResponse> upsert(
      AuthPrincipal principal, @RequestBody UpsertDailyDistanceRequest body) {
    FitnessService.UpsertResult result =
        fitnessService.upsertDailyDistance(
            principal, LocalDate.parse(body.date()), body.source(), body.distanceKm());
    return ResponseEntity.ok(
        new UpsertDailyDistanceResponse(result.prevKm(), result.nowKm(), result.deltaKm()));
  }
}
