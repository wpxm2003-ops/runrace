package com.runrace.backend.auth.dto;

/**
 * 실시간 진행률 공유 설정. 두 축을 각각 끌 수 있다.
 *
 * @param publicEnabled 공개(비크루) 레이스 — 기본 true
 * @param crewEnabled 크루 내부 레이스 — 기본 true(폐쇄 로스터). 둘 다 끌 수 있다
 */
public record LiveProgressSettingResponse(boolean publicEnabled, boolean crewEnabled) {}
