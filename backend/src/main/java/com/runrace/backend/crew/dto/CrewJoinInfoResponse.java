package com.runrace.backend.crew.dto;

/**
 * 초대 링크 랜딩(/crew/join?code=...) 정보 — 비로그인도 조회 가능.
 * status: JOINABLE | FULL | ALREADY_MEMBER(이 크루 소속) | IN_OTHER_CREW(다른 크루 소속).
 * 비로그인에서는 JOINABLE/FULL만 나온다.
 */
public record CrewJoinInfoResponse(String name, int memberCount, int maxMembers, String status) {}
