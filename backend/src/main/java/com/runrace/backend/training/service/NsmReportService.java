package com.runrace.backend.training.service;

import com.runrace.backend.common.ApiException;
import com.runrace.backend.training.domain.NsmRetestLog;
import com.runrace.backend.training.domain.NsmSessionLog;
import com.runrace.backend.training.dto.NsmBlockReportResponse;
import com.runrace.backend.training.dto.NsmMyReportResponse;
import com.runrace.backend.training.dto.NsmRetestPointDto;
import com.runrace.backend.training.repository.NsmRetestLogRepository;
import com.runrace.backend.training.repository.NsmSessionLogRepository;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * NSM 성장 리포트 — 마이 리포트(역치 추이 + 누적, 인증)와 블록 리포트(직전 재측정 대비, 공개)를 계산한다.
 * training_plan은 upsert라 과거 값이 없으므로 전부 nsm_retest_log/nsm_session_log에서 재구성한다.
 */
@Service
@RequiredArgsConstructor
public class NsmReportService {

  /**
   * sub-T 렙당 소요 분(SHORT=3, MEDIUM=6, LONG=10) — frontend/src/lib/nsm.ts의 repAmount와 동일해야 한다.
   * 이 값은 방법론 자체가 정의하는 세션 길이라 잘 안 바뀌지만, 만약 nsm.ts 쪽 렙 시간을 바꾸면
   * 여기도 함께 맞춰야 리포트의 "총 훈련 시간"이 정확해진다.
   */
  private static final Map<String, Integer> KIND_MINUTES_PER_REP = Map.of(
      "SHORT", 3, "MEDIUM", 6, "LONG", 10);

  /** 마이 리포트에 담을 최대 재측정 개수(그래프 폭 방어) — 4주 주기 기준 약 4년치. */
  private static final int MAX_RETEST_POINTS = 52;

  private final NsmRetestLogRepository retestLogRepository;
  private final NsmSessionLogRepository sessionLogRepository;

  private static long totalMinutes(List<NsmSessionLog> logs) {
    long minutes = 0;
    for (NsmSessionLog log : logs) {
      Integer perRep = KIND_MINUTES_PER_REP.get(log.getSessionKind());
      if (perRep == null) continue;
      Integer repsDone = log.getRepsDone();
      if (repsDone != null) minutes += (long) perRep * repsDone;
    }
    return minutes;
  }

  /** 내 성장 리포트 — 역치 추이(최근 {@value #MAX_RETEST_POINTS}개) + 전 기간 누적. */
  @Transactional(readOnly = true)
  public NsmMyReportResponse myReport(UUID userId) {
    List<NsmRetestLog> all = retestLogRepository.findByUserIdOrderByCreatedAtAsc(userId);
    List<NsmRetestLog> retests = all.size() > MAX_RETEST_POINTS
        ? all.subList(all.size() - MAX_RETEST_POINTS, all.size())
        : all;

    List<NsmSessionLog> completed = sessionLogRepository.findByUserIdAndCompletedIsTrue(userId);

    Long latestBlockRetestId = all.size() >= 2 ? all.get(all.size() - 1).getId() : null;

    return new NsmMyReportResponse(
        retests.stream().map(NsmRetestPointDto::from).toList(),
        completed.size(),
        totalMinutes(completed),
        latestBlockRetestId);
  }

  /**
   * 블록(직전 재측정 → 이 재측정) 공개 리포트. 직전 재측정이 없으면(첫 재측정) 아직 비교할
   * 블록이 없다는 뜻이라 404.
   */
  @Transactional(readOnly = true)
  public NsmBlockReportResponse blockReport(Long retestId) {
    NsmRetestLog end = retestLogRepository.findById(retestId)
        .orElseThrow(() -> ApiException.notFound("retest_not_found"));
    NsmRetestLog start = retestLogRepository
        .findTopByUserIdAndCreatedAtLessThanOrderByCreatedAtDesc(end.getUserId(), end.getCreatedAt())
        .orElseThrow(() -> ApiException.notFound("no_previous_retest"));

    List<NsmSessionLog> inBlock = sessionLogRepository.findByUserIdAndCompletedIsTrueAndCompletedAtBetween(
        end.getUserId(), start.getCreatedAt(), end.getCreatedAt());

    long days = Duration.between(start.getCreatedAt(), end.getCreatedAt()).toDays();

    return new NsmBlockReportResponse(
        days,
        start.getVdot(), end.getVdot(),
        start.getThresholdPaceSec(), end.getThresholdPaceSec(),
        start.getSourceDistanceM(), start.getSourceTimeSec(),
        end.getSourceDistanceM(), end.getSourceTimeSec(),
        inBlock.size(),
        totalMinutes(inBlock));
  }
}
