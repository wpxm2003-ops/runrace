package com.runrace.backend.workout.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.runrace.backend.workout.domain.PersonalBest;
import com.runrace.backend.workout.repository.PersonalBestRepository;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class PersonalBestServiceTest {

  private final PersonalBestRepository repo = mock(PersonalBestRepository.class);
  private final PersonalBestService service = new PersonalBestService(repo);
  private final UUID userId = UUID.randomUUID();

  @Nested class Evaluate {

    @Test void 빈_segments는_레포지토리_조회_없이_빈_결과() {
      var result = service.evaluate(userId, 1L, Map.of());
      assertTrue(result.isEmpty());
      verify(repo, never()).findByUserIdAndDistanceKey(any(), any());
    }

    @Test void 첫_기록은_저장_후_empty_반환() {
      when(repo.findByUserIdAndDistanceKey(userId, "5k")).thenReturn(Optional.empty());
      when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

      var result = service.evaluate(userId, 1L, Map.of("5k", 300));

      assertTrue(result.isEmpty());
      verify(repo).save(any(PersonalBest.class));
    }

    @Test void 기존보다_빠른_페이스면_PB_갱신하고_반환() {
      var existing = PersonalBest.of(userId, "5k", 360, 5_000, 1L);
      when(repo.findByUserIdAndDistanceKey(userId, "5k")).thenReturn(Optional.of(existing));
      when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

      var result = service.evaluate(userId, 2L, Map.of("5k", 300));

      assertTrue(result.isPresent());
      assertEquals("5k", result.get().distanceKey());
      assertEquals(360, result.get().previousPaceSec());
      assertEquals(300, result.get().newPaceSec());
    }

    @Test void 기존보다_느린_페이스면_갱신없이_빈_결과() {
      var existing = PersonalBest.of(userId, "5k", 300, 5_000, 1L);
      when(repo.findByUserIdAndDistanceKey(userId, "5k")).thenReturn(Optional.of(existing));

      var result = service.evaluate(userId, 2L, Map.of("5k", 360));

      assertTrue(result.isEmpty());
      verify(repo, never()).save(any());
    }

    @Test void 같은_페이스면_갱신없이_빈_결과() {
      var existing = PersonalBest.of(userId, "5k", 300, 5_000, 1L);
      when(repo.findByUserIdAndDistanceKey(userId, "5k")).thenReturn(Optional.of(existing));

      var result = service.evaluate(userId, 2L, Map.of("5k", 300));

      assertTrue(result.isEmpty());
    }

    @Test void 여러_버킷_갱신_시_가장_긴_거리_키가_반환됨() {
      // 5k와 10k 모두 갱신됐을 때 마지막으로 덮어쓰인 10k가 반환되어야 함
      var existing5k = PersonalBest.of(userId, "5k", 360, 5_000, 1L);
      var existing10k = PersonalBest.of(userId, "10k", 360, 10_000, 1L);
      when(repo.findByUserIdAndDistanceKey(userId, "5k")).thenReturn(Optional.of(existing5k));
      when(repo.findByUserIdAndDistanceKey(userId, "10k")).thenReturn(Optional.of(existing10k));
      when(repo.findByUserIdAndDistanceKey(eq(userId), eq("half"))).thenReturn(Optional.empty());
      when(repo.findByUserIdAndDistanceKey(eq(userId), eq("marathon"))).thenReturn(Optional.empty());
      when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

      var result = service.evaluate(userId, 2L, Map.of("5k", 300, "10k", 330, "half", 340, "marathon", 350));

      assertTrue(result.isPresent());
      // half/marathon은 첫 기록(저장만, 반환 없음), 5k/10k 갱신 중 마지막 = 10k
      assertEquals("10k", result.get().distanceKey());
      assertEquals(330, result.get().newPaceSec());
    }

    @Test void paceSec가_0_이하면_스킵() {
      var result = service.evaluate(userId, 1L, Map.of("5k", 0));
      assertTrue(result.isEmpty());
      verify(repo, never()).findByUserIdAndDistanceKey(any(), any());
    }
  }
}
