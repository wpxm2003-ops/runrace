package com.runrace.backend.crew.dto;

import java.math.BigDecimal;

public record UpdateCrewRequest(String notice, BigDecimal weekGoalKm) {}
