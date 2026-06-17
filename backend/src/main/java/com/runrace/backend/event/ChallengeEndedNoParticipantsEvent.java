package com.runrace.backend.event;

import java.util.UUID;

/** 참여자가 방장 1명뿐이라 무효 종료된 레이스 — 방장에게 안내 푸시를 보낸다. */
public record ChallengeEndedNoParticipantsEvent(Long challengeId, UUID creatorUserId) {}
