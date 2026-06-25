package com.runrace.backend.workout.dto;

/** 러닝의 신발 귀속 변경 요청. shoeId가 null이면 귀속 해제. */
public record UpdateWorkoutShoeRequest(Long shoeId) {}
