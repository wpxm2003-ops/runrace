package com.runrace.backend.challenge.dto;

/**
 * 경품 목록 한 줄. 경품명은 공개, 이미지는 유무만 노출.
 * S3 키는 어떤 클라이언트에도 반환하지 않는다(공개 버킷에서 게이트 우회 방지) — 수정 시 이미지 보존은
 * 추후 불투명 핸들 방식으로 재설계.
 * @param viewed 당첨자가 기프티콘을 열람했는지(수령 표시).
 */
import com.runrace.backend.challenge.domain.PrizeAwardType;

public record PrizeRow(
    int rank, String name, boolean hasImage, boolean viewed, PrizeAwardType awardType) {}
