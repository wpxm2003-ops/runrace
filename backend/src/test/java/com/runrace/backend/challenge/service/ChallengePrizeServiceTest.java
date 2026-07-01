package com.runrace.backend.challenge.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.runrace.backend.challenge.dto.PrizeItemRequest;
import java.util.Map;
import java.util.function.Predicate;
import org.junit.jupiter.api.Test;

/** 경품 저장 시 이미지 보존 키 매칭 순수 로직 테스트(부작용 없는 정적 메서드 대상). */
class ChallengePrizeServiceTest {

  /** prizes/ 프리픽스만 유효한 비공개 키로 인정(ImageUploadService.isPrivateKey와 동일). */
  private static final Predicate<String> IS_PRIVATE = k -> k != null && k.startsWith("prizes/");

  private static PrizeItemRequest item(int rank, String imageKey, boolean keepImage, Integer keepFromRank) {
    return new PrizeItemRequest(rank, "경품", imageKey, keepImage, keepFromRank);
  }

  /** 기존 경품: 1등=prizes/A, 2등=prizes/B. */
  private static Map<Integer, String> oldKeys() {
    return Map.of(1, "prizes/A", 2, "prizes/B");
  }

  @Test
  void 편집중_순서가_바뀌어도_보존이미지는_원본등수로_매칭된다() {
    // 2등(prizes/B)이 1등으로 재부여된 항목. 현재 rank(1)가 아니라 원본 등수(2)로 매칭해야 한다.
    String key = ChallengePrizeService.keptKey(item(1, null, true, 2), oldKeys(), IS_PRIVATE);
    assertEquals("prizes/B", key); // 회귀 시 "prizes/A"가 나와 이미지가 뒤바뀜
  }

  @Test
  void 변경없이_보존하면_각_등수의_이미지가_그대로() {
    assertEquals("prizes/A", ChallengePrizeService.keptKey(item(1, null, true, 1), oldKeys(), IS_PRIVATE));
    assertEquals("prizes/B", ChallengePrizeService.keptKey(item(2, null, true, 2), oldKeys(), IS_PRIVATE));
  }

  @Test
  void 새로_업로드한_비공개키를_사용한다() {
    assertEquals(
        "prizes/C", ChallengePrizeService.keptKey(item(1, "prizes/C", false, null), oldKeys(), IS_PRIVATE));
  }

  @Test
  void 이미지_없으면_null() {
    assertNull(ChallengePrizeService.keptKey(item(1, null, false, null), oldKeys(), IS_PRIVATE));
  }

  @Test
  void 외부_형식_키는_거부하고_null() {
    assertNull(ChallengePrizeService.keptKey(item(1, "uploads/x.jpg", false, null), oldKeys(), IS_PRIVATE));
  }

  @Test
  void 보존_원본등수에_이미지가_없으면_새_업로드_키로_폴백() {
    // 원본 등수 5에는 기존 이미지가 없으므로, 함께 온 새 업로드 키를 사용.
    String key = ChallengePrizeService.keptKey(item(2, "prizes/D", true, 5), oldKeys(), IS_PRIVATE);
    assertEquals("prizes/D", key);
  }

  @Test
  void keepImageFromRank가_null이면_현재_rank로_폴백된다() {
    assertEquals("prizes/B", ChallengePrizeService.keptKey(item(2, null, true, null), oldKeys(), IS_PRIVATE));
  }
}
