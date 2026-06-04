package com.runrace.backend.fitness.dto;

import java.math.BigDecimal;

public record UpsertDailyDistanceRequest(String date, String source, BigDecimal distanceKm) {}
