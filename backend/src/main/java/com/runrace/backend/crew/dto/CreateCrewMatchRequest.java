package com.runrace.backend.crew.dto;

import java.util.List;
import java.util.UUID;

/**
 * 도전장 생성 — 상대 크루는 이름으로 지목(크루명 unique), 로스터는 내 크루 출전 명단.
 * startAt/endAt은 레이스 등록과 동일한 규칙으로 검증된다.
 */
public record CreateCrewMatchRequest(
    String opponentCrewName,
    int rosterSize,
    String startAt,
    String endAt,
    List<UUID> rosterUserIds) {}
