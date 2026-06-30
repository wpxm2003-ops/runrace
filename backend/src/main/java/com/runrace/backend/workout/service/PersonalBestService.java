package com.runrace.backend.workout.service;

import com.runrace.backend.common.IsoTime;
import com.runrace.backend.workout.domain.PersonalBest;
import com.runrace.backend.workout.dto.PersonalBestResult;
import com.runrace.backend.workout.dto.PersonalBestRow;
import com.runrace.backend.workout.repository.PersonalBestRepository;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class PersonalBestService {

  static final List<String> DISTANCE_KEYS = List.of("3k", "5k", "10k", "half", "marathon");

  private final PersonalBestRepository personalBestRepository;

  /** 내 PB 목록(거리 오름차순) — NSM 페이스 자동 입력용. */
  @Transactional(readOnly = true)
  public List<PersonalBestRow> listForUser(UUID userId) {
    return personalBestRepository.findAllByUserId(userId).stream()
        .sorted(Comparator.comparingInt(PersonalBest::getDistanceM))
        .map(pb -> new PersonalBestRow(
            pb.getDistanceKey(),
            pb.getBestPaceSec(),
            pb.getDistanceM(),
            IsoTime.format(pb.getAchievedAt())))
        .toList();
  }

  /**
   * 프론트가 계산한 베스트 구간 페이스(초/km)를 받아 PB 갱신 여부를 판정한다.
   * distanceKey → paceSec 맵에서 각 키별로 기존 PB와 비교하고, 갱신된 항목 중 가장
   * 큰 거리(마라톤 > 하프 > 10k > 5k)를 대표로 반환한다.
   *
   * @param segments distanceKey → paceSec (null이면 해당 거리 미달로 스킵)
   */
  @Transactional
  public Optional<PersonalBestResult> evaluate(
      UUID userId, Long workoutId, Map<String, Integer> segments) {

    PersonalBestResult best = null;

    for (String key : DISTANCE_KEYS) {
      Integer paceSec = segments.get(key);
      if (paceSec == null || paceSec <= 0) continue;

      Optional<PersonalBest> existing = personalBestRepository.findByUserIdAndDistanceKey(userId, key);

      if (existing.isEmpty()) {
        personalBestRepository.save(PersonalBest.of(userId, key, paceSec, targetDistanceM(key), workoutId));
        continue;
      }

      PersonalBest pb = existing.get();
      if (paceSec < pb.getBestPaceSec()) {
        long days = ChronoUnit.DAYS.between(pb.getAchievedAt(), OffsetDateTime.now());
        best = new PersonalBestResult(key, pb.getBestPaceSec(), paceSec, days);
        pb.update(paceSec, targetDistanceM(key), workoutId);
        personalBestRepository.save(pb);
      }
    }

    return Optional.ofNullable(best);
  }

  private static int targetDistanceM(String key) {
    return switch (key) {
      case "3k" -> 3_000;
      case "5k" -> 5_000;
      case "10k" -> 10_000;
      case "half" -> 21_097;
      case "marathon" -> 42_195;
      default -> throw new IllegalArgumentException("unknown key: " + key);
    };
  }
}
