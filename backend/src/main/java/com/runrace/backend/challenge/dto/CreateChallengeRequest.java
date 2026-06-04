package com.runrace.backend.challenge.dto;

public record CreateChallengeRequest(
    String title, int goalKm, int maxMembers, String startAt, String endAt) {}
