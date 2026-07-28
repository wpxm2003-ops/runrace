package com.runrace.backend.training.dto;

/**
 * NSM 블록(직전 재측정 → 이번 재측정) 공개 리포트 — 인증 불필요, 사용자 식별 정보 미포함
 * (WorkoutShareResponse와 동일한 공개 공유 원칙: 링크만 알면 누구나 볼 수 있는 비식별 집계).
 *
 * @param days               블록 기간(일)
 * @param startVdot          블록 시작 시점 VDOT
 * @param endVdot            블록 종료(이번 재측정) VDOT
 * @param startThresholdPaceSec 블록 시작 역치 페이스(초/km)
 * @param endThresholdPaceSec   블록 종료 역치 페이스(초/km) — 작을수록 빨라진 것
 * @param startSourceDistanceM  시작 시험주 거리(m)
 * @param startSourceTimeSec    시작 시험주 기록(초)
 * @param endSourceDistanceM    종료 시험주 거리(m)
 * @param endSourceTimeSec      종료 시험주 기록(초)
 * @param subTCompleted      블록 기간 중 완주한 sub-T 세션 수
 * @param subTMinutes        블록 기간 중 완주한 sub-T 총 시간(분)
 */
public record NsmBlockReportResponse(
    long days,
    double startVdot,
    double endVdot,
    int startThresholdPaceSec,
    int endThresholdPaceSec,
    int startSourceDistanceM,
    int startSourceTimeSec,
    int endSourceDistanceM,
    int endSourceTimeSec,
    long subTCompleted,
    long subTMinutes) {}
