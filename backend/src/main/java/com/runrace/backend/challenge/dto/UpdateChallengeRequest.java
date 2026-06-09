package com.runrace.backend.challenge.dto;

import java.math.BigDecimal;

public record UpdateChallengeRequest(
    String title, BigDecimal goalKm, int maxMembers, String startAt, String endAt) {}
