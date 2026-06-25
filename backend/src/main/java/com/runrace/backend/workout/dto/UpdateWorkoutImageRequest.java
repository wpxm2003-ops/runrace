package com.runrace.backend.workout.dto;

/** 운동 사진(imageUrl) 설정·교체·삭제. imageUrl이 null/blank면 삭제. */
public record UpdateWorkoutImageRequest(String imageUrl) {}
