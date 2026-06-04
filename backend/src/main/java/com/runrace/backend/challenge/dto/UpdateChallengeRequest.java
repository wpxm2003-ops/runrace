package com.runrace.backend.challenge.dto;

public record UpdateChallengeRequest(
    String title, int goalKm, int maxMembers, String startDate, String endDate) {}
