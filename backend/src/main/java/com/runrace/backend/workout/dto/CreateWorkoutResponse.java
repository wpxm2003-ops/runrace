package com.runrace.backend.workout.dto;

import java.util.List;

public record CreateWorkoutResponse(
    Long id, PersonalBestResult personalBest, List<Achievement> achievements) {}
