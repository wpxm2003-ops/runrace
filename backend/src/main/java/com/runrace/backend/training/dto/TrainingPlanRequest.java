package com.runrace.backend.training.dto;

/** NSM 플랜 저장 요청 — 프론트(nsm.ts)가 계산한 값 + 원본 기록. subTDays: 월=0…일=6. */
public record TrainingPlanRequest(
    double vdot,
    int thresholdPaceSec,
    int[] subTDays,
    int sourceDistanceM,
    int sourceTimeSec) {}
