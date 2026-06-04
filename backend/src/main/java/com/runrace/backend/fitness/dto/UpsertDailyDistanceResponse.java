package com.runrace.backend.fitness.dto;

import java.math.BigDecimal;

public record UpsertDailyDistanceResponse(BigDecimal prevKm, BigDecimal nowKm, BigDecimal deltaKm) {}
