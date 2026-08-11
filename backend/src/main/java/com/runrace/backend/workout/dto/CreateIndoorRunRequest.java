package com.runrace.backend.workout.dto;

import java.util.UUID;

/** 실내러닝(러닝머신) 등록 요청. 페이스·칼로리는 서버가 계산한다. */
public record CreateIndoorRunRequest(
    UUID clientWorkoutId,
    int distanceM,
    int durationSec,
    String startedAt,
    /** 시작 시각의 기기 벽시계 "YYYY-MM-DDTHH:mm:ss"(타임존 없음). 구클라이언트는 null. */
    String startedAtLocal,
    String imageUrl   // 이미지 업로드 후 받은 URL (nullable)
) {}
