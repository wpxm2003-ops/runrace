package com.runrace.backend.event;

import java.util.List;
import java.util.UUID;

/**
 * 운동 기록 반영 후 순위가 올라가 다른 참가자를 추월했을 때 발생.
 * 추월당한 참가자들에게 알림을 보낸다.
 */
public record RankOvertakeEvent(
    Long challengeId,
    UUID overtakerUserId,
    String overtakerNickname,
    List<UUID> overtakenUserIds) {}
