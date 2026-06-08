package com.runrace.backend.workout.dto;

/** 실내러닝(러닝머신) 등록 요청. 페이스·칼로리는 서버가 계산한다. */
public record CreateIndoorRunRequest(
    int distanceM,
    int durationSec,
    String startedAt,
    String imageUrl   // 이미지 업로드 후 받은 URL (nullable)
) {}
