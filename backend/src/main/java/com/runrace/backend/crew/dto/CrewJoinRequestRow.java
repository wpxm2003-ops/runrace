package com.runrace.backend.crew.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

/** 리더 인박스 한 줄 — 대기중 가입신청. */
public record CrewJoinRequestRow(
    long requestId, UUID applicantUserId, String applicantNickname, String message, OffsetDateTime appliedAt) {}
