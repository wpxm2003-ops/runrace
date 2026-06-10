package com.runrace.backend.friend;

import java.util.UUID;

/** 친구 도메인에서 커밋 후 발생하는 이벤트 모음. */
public final class FriendEvents {
  private FriendEvents() {}

  /** 콕 찌르기(넛지)가 저장됨 — 커밋 후 수신자에게 푸시한다. */
  public record NudgeSent(UUID receiverUserId, String senderNickname, String message) {}
}
