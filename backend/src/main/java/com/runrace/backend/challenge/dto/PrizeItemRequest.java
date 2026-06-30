package com.runrace.backend.challenge.dto;

/**
 * 경품 등록 항목.
 * @param keepImage true면 해당 등수의 기존 S3 이미지를 그대로 보존 (수정 시 재업로드 불필요).
 *                  false면 imageKey가 새 이미지 키이거나 null(이미지 없음).
 */
public record PrizeItemRequest(int rank, String name, String imageKey, boolean keepImage) {}
