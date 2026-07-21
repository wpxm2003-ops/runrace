package com.runrace.backend.crew.dto;

/** 크루 발견 프로필 수정 — 지역(필수)·이미지·소개·정기런(전부 선택). */
public record UpdateCrewProfileRequest(
    String region,
    String imageUrl,
    String intro,
    String meetupPlace,
    int[] meetupDays,
    String meetupTime) {}
