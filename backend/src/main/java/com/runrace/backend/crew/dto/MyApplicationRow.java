package com.runrace.backend.crew.dto;

import java.time.OffsetDateTime;

/** 내 신청 현황 한 줄 — 대기중인 가입신청. */
public record MyApplicationRow(long requestId, long crewId, String crewName, OffsetDateTime appliedAt) {}
