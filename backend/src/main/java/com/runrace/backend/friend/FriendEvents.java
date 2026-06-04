package com.runrace.backend.friend;

import java.util.UUID;

/** 친구 도메인에서 커밋 후 발생하는 이벤트 모음. */
public final class FriendEvents {
  private FriendEvents() {}

  /** 친구 초대가 생성됨. */
  public record InviteCreated(UUID inviterUserId, String code) {}

  /** 친구 초대가 수락되어 양방향 친구 관계가 맺어짐. */
  public record InviteAccepted(UUID inviterUserId, UUID accepterUserId, String code) {}
}
