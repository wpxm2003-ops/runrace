package com.runrace.backend.challenge.dto;

import java.util.List;

/** 한 챌린지 안에서 호출자가 등록한 라이벌들과의 실시간 격차. */
public record ChallengeLiveGaps(Long challengeId, List<RivalGapRow> rivalGaps) {}
