package com.runrace.backend.crew.dto;

import java.util.List;
import java.util.UUID;

/** 도전장 수락 — 상대(수락) 크루의 출전 명단. 인원은 도전장의 rosterSize를 따른다. */
public record AcceptCrewMatchRequest(List<UUID> rosterUserIds) {}
