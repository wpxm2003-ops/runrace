package com.runrace.backend.event;

import java.util.List;
import java.util.UUID;

/**
 * 레이스 참가자가 목표의 50%를 최초로 달성했을 때 발생(현재 임계값은 50%만 운영).
 * 나머지 미완주 참가자들에게 경고·독려 푸시를 트리거한다.
 */
public record MilestoneReachedEvent(
    Long challengeId,
    UUID achieverUserId,
    String achieverNickname,
    List<UUID> otherMemberIds) {}
