package com.runrace.backend.challenge;

import java.util.List;
import java.util.UUID;

/** 레이스가 정상 종료(기간 만료 또는 전원 완주)됐을 때 — 멤버 전원에게 종료/우승 알림. */
public record ChallengeEndedEvent(Long challengeId, String winnerNickname, List<UUID> memberIds) {}
