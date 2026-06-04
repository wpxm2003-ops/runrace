package com.runrace.backend.fitness;

import java.util.UUID;

/** 사용자의 일일 거리가 실제로 변경(델타 ≠ 0)되어 커밋된 뒤 발생한다. 같은 대결 멤버 알림 트리거. */
public record DailyDistanceSyncedEvent(UUID userId) {}
