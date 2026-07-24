package com.runrace.backend.workout.dto;

public record GhostRaceResultDto(
    double overlapDistanceM,
    long myTimeMs,
    long ghostTimeMs,
    long deltaMs) {}
