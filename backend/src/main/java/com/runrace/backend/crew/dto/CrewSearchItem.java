package com.runrace.backend.crew.dto;

/** 크루 검색 결과 한 줄(도전장 상대 선택용). */
public record CrewSearchItem(long id, String name, int memberCount) {}
