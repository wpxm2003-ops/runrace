package com.runrace.backend.crew.dto;

import java.util.List;

/**
 * 크루 잔디 + 명예의 전당 — 크루 홈 부가 콘텐츠(파생 데이터, 저장 0).
 * heatmap은 기록이 있는 날만 담는다(빈 날은 프론트가 0으로 채움).
 */
public record CrewInsightsResponse(
    /** 잔디 그리드 시작일(이번 달 1일, ISO date) — 캘린더 월 기준이라 매달 그리드 모양이 다르다. */
    String heatmapFrom,
    int memberCount,
    List<DayCell> heatmap,
    /** 월별 MVP(최신월 우선, 진행 중인 이번 달 제외, 최대 12개월). */
    List<HallEntry> hallOfFame) {

  /** nicknames는 가입 순 최대 10명 — 대형 크루 페이로드 방지(넘치면 runners로 "외 n명" 표시). */
  public record DayCell(String date, int runners, List<String> nicknames) {}

  public record HallEntry(String month, String nickname, long distanceM) {}
}
