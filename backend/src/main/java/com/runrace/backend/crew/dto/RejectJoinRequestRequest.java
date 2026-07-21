package com.runrace.backend.crew.dto;

/** 가입 신청 거절 — 사유는 선택. */
public record RejectJoinRequestRequest(String reason) {}
