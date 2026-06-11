package com.runrace.backend.challenge;

import java.util.List;
import java.util.UUID;

/**
 * 레이스 참가자가 목표의 특정 비율(50%, 80%)을 최초로 달성했을 때 발생.
 * 나머지 미완주 참가자들에게 경고·독려 푸시를 트리거한다.
 */
public record MilestoneReachedEvent(
    Long challengeId,
    UUID achieverUserId,
    String achieverNickname,
    int milestonePercent,
    List<UUID> otherMemberIds) {}
