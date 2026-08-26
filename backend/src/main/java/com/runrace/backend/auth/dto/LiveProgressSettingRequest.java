package com.runrace.backend.auth.dto;

/**
 * 실시간 진행률 공유 설정 변경 — 바꾸려는 축만 담아 보낸다(null이면 그대로 둔다).
 * 토글 하나를 누를 때 다른 축까지 함께 덮어쓰지 않게 하기 위함이다.
 *
 * @param publicEnabled 공개(비크루) 레이스 공유 여부. null이면 변경하지 않음
 * @param crewEnabled 크루 내부 레이스 공유 여부. null이면 변경하지 않음
 */
public record LiveProgressSettingRequest(Boolean publicEnabled, Boolean crewEnabled) {}
