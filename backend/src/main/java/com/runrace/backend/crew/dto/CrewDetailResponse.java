package com.runrace.backend.crew.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * 공개 크루 상세 — 비회원도 조회 가능(멤버 명단은 비공개, 인원수만).
 * myApplicationStatus는 로그인 + 대기중 신청이 있을 때만 "PENDING", 그 외 null.
 */
public record CrewDetailResponse(
    long id,
    String name,
    String region,
    String imageUrl,
    List<String> imageUrls,
    String intro,
    int memberCount,
    int maxMembers,
    String meetupPlace,
    int[] meetupDays,
    String meetupTime,
    OffsetDateTime createdAt,
    LocalDate foundedAt,
    String leaderNickname,
    boolean isFull,
    String myApplicationStatus,
    boolean inCooldown) {}
