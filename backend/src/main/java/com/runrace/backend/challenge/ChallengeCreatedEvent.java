package com.runrace.backend.challenge;

import java.util.UUID;

/** 새 대결방이 생성되어 커밋된 뒤 발생한다. 분석 기록·멤버 푸시 알림의 트리거. */
public record ChallengeCreatedEvent(Long challengeId, UUID creatorUserId) {}
