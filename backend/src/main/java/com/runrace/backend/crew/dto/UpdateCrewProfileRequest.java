package com.runrace.backend.crew.dto;

import java.time.LocalDate;
import java.util.List;

/** 크루 발견 프로필 수정 — 지역(필수)·이미지·소개·정기런·창설일(전부 선택). */
public record UpdateCrewProfileRequest(
    String region,
    String imageUrl,
    List<String> imageUrls,
    String intro,
    String meetupPlace,
    int[] meetupDays,
    String meetupTime,
    LocalDate foundedAt) {}
