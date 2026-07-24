package com.runrace.backend.training.dto;

/**
 * NSM sub-T 세션 수행 기록 요청 — 런 저장 성공 직후 클라이언트가 1회 전송한다.
 * day: 0=월…6=일, kind: SHORT/MEDIUM/LONG, completed: 렙 가이드를 끝까지 완료했는지.
 */
public record NsmSessionLogRequest(
    Long workoutId,
    int day,
    String kind,
    Integer targetPaceSec,
    Integer repsPlanned,
    Integer repsDone,
    boolean completed) {}
