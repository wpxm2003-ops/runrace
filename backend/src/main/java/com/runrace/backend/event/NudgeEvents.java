package com.runrace.backend.event;

import java.util.UUID;

/** 콕 찌르기 도메인에서 커밋 후 발생하는 이벤트. */
public final class NudgeEvents {
  private NudgeEvents() {}

  /**
   * 콕 찌르기가 저장됨 — 커밋 후 수신자에게 푸시한다.
   * titleKey는 출처(레이스/크루 레이스/크루)가 드러나는 제목 키,
   * bodyKey는 수신자 언어로 렌더링할 프리셋 본문 메시지 키.
   */
  public record NudgeSent(
      UUID receiverUserId, String senderNickname, String titleKey, String bodyKey) {}
}
