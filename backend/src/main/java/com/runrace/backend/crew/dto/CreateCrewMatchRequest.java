package com.runrace.backend.crew.dto;

import java.util.List;
import java.util.UUID;

/** 도전장 생성 — 상대 크루는 이름으로 지목(크루명 unique), 로스터는 내 크루 출전 명단. */
public record CreateCrewMatchRequest(
    String opponentCrewName,
    int rosterSize,
    int durationDays,
    List<UUID> rosterUserIds) {}
