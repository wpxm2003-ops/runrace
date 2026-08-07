package com.runrace.backend.challenge.dto;

import java.math.BigDecimal;

public record ChallengeListItem(
    Long id,
    String title,
    BigDecimal goalKm,
    String phase,
    String startAt,
    String endAt,
    int memberCount,
    String createdAt,
    boolean isOwner,
    boolean isMember,
    /** 경품이 하나라도 등록됐는지 — 목록 뱃지용(경품명·이미지는 미노출). */
    boolean hasPrize,
    /** 내기 문구가 등록됐는지 — 목록의 선물 아이콘 표시용(문구 자체는 상세에서만 노출). */
    boolean hasStake,
    /**
     * 크루 전용 레이스인지 — 목록의 '크루' 라벨용. 내 레이스 목록은 공개 레이스와 크루
     * 레이스가 섞여 나오는데, 소속 크루명까지는 필요 없고 구분만 되면 되므로 boolean만 낸다.
     */
    boolean crewOnly) {}
