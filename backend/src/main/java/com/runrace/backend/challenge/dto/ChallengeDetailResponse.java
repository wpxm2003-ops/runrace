package com.runrace.backend.challenge.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record ChallengeDetailResponse(
    Long id,
    String title,
    BigDecimal goalKm,
    int maxMembers,
    String startAt,
    String endAt,
    String stake,
    /** 크루 내부 레이스면 크루명(뱃지 표시용). 일반 레이스·크루 해체 시 null. */
    String crewName,
    UUID creatorUserId,
    UUID currentUserId,
    boolean isMember,
    boolean isOwner,
    boolean hasStarted,
    boolean hasEnded,
    boolean showManage,
    boolean canJoin,
    boolean canLeave,
    int memberCount,
    /**
     * 라이브(잠정) 진행률이 현재 신선한 멤버 수 — 닉네임 등 식별정보 없는 집계치라
     * 라이브를 볼 자격이 없는 조회자(비인증·종료·크루 외부)에게는 0("지금 N명이 뛰는 중" 익명 표시용).
     */
    int liveRunnerCount,
    List<MemberRow> members) {}
