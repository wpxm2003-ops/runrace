package com.runrace.backend.training.dto;

import java.util.List;

/**
 * 내 NSM 성장 리포트(인증 필요) — 역치 추이 전체 + 전 기간 누적 통계.
 *
 * @param retests            재측정 이력(오래된 순) — 그래프의 각 점
 * @param totalSubTCompleted 전 기간 완주한 sub-T 세션 수
 * @param totalSubTMinutes   전 기간 완주한 sub-T 총 시간(분)
 * @param latestBlockRetestId 가장 최근 블록(직전 재측정→최신 재측정)의 공개 리포트 id. 블록이 없으면 null
 */
public record NsmMyReportResponse(
    List<NsmRetestPointDto> retests,
    long totalSubTCompleted,
    long totalSubTMinutes,
    Long latestBlockRetestId) {}
