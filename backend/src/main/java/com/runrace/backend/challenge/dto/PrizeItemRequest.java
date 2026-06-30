package com.runrace.backend.challenge.dto;

/** 경품 등록 항목 — 등수·경품명(필수)·이미지 비공개 키(선택). */
public record PrizeItemRequest(int rank, String name, String imageKey) {}
