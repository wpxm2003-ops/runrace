package com.runrace.backend.crew.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * 공개 크루 상세 — 비회원도 조회 가능(멤버 명단은 비공개, 인원수만).
 *
 * <p>내 신청 상태는 여기 담지 않는다. 예전에는 {@code myApplicationStatus}로 "PENDING"만
 * 실어 보냈는데, 화면은 신청 취소에 requestId가 필요해 결국 별도 API(`/api/crews/applications`)를
 * 부를 수밖에 없었다 — 조회마다 EXISTS 한 번을 더 쓰면서 아무도 읽지 않는 필드였다.
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
    boolean inCooldown) {}
