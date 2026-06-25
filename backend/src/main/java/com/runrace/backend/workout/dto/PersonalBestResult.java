package com.runrace.backend.workout.dto;

/** 운동 저장 후 PB 갱신 시 응답에 포함되는 정보. */
public record PersonalBestResult(
    String distanceKey,
    int previousPaceSec,
    int newPaceSec,
    long daysSincePrevious
) {}
