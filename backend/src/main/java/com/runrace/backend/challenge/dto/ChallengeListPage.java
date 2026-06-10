package com.runrace.backend.challenge.dto;

import java.util.List;

/** 공개 레이스 목록 페이지 응답. hasNext로 무한스크롤 추가 로드 여부를 판단한다. */
public record ChallengeListPage(List<ChallengeListItem> items, boolean hasNext) {}
