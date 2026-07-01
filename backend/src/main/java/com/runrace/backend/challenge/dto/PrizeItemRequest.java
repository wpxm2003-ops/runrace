package com.runrace.backend.challenge.dto;

/**
 * 경품 등록 항목.
 * @param keepImage true면 기존 S3 이미지를 그대로 보존 (수정 시 재업로드 불필요).
 *                  false면 imageKey가 새 이미지 키이거나 null(이미지 없음).
 * @param keepImageFromRank keepImage=true일 때 보존할 기존 이미지의 '원본 등수'. 편집 중 순서가
 *                          바뀌어도 이미지를 정확히 매칭한다. null이면 현재 rank로 폴백(하위호환).
 */
public record PrizeItemRequest(
    int rank, String name, String imageKey, boolean keepImage, Integer keepImageFromRank) {}
