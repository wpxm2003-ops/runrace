package com.runrace.backend.training.dto;

/**
 * 이번 주 sub-T 진척.
 *
 * @param completed 이번 주(월요일 KST 시작) 완주한 sub-T 세션 수
 * @param planned   활성 플랜의 주간 sub-T 횟수. 플랜이 없으면 0
 */
public record NsmWeeklyProgressResponse(long completed, int planned) {}
