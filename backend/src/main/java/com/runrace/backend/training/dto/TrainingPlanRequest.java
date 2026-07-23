package com.runrace.backend.training.dto;

/**
 * NSM 플랜 저장 요청 — 프론트(nsm.ts)가 계산한 값 + 원본 기록. subTDays: 월=0…일=6.
 * weeklyBand: 주간 러닝 볼륨 밴드(0~4). 미지정이면 null(레거시 기본 동작).
 */
public record TrainingPlanRequest(
    double vdot,
    int thresholdPaceSec,
    int[] subTDays,
    int sourceDistanceM,
    int sourceTimeSec,
    Integer weeklyBand) {}
