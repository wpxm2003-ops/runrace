package com.runrace.backend.friend;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.user.AppUser;
import com.runrace.backend.user.AppUserRepository;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class FriendService {
  private static final SecureRandom RANDOM = new SecureRandom();
  private static final HexFormat HEX = HexFormat.of();
  private static final int INVITE_CODE_BYTES = 16;
  private static final ZoneId KST = ZoneId.of("Asia/Seoul");

  private final AppUserRepository appUserRepository;
  private final FriendInviteRepository friendInviteRepository;
  private final FriendshipRepository friendshipRepository;
  private final FriendNudgeRepository friendNudgeRepository;
  private final ApplicationEventPublisher eventPublisher;

  @Transactional
  public FriendInvite createInvite(AuthPrincipal principal, int expireHours) {
    AppUser inviter = appUserRepository.getRequired(principal.userId());

    OffsetDateTime now = OffsetDateTime.now();
    return friendInviteRepository.save(FriendInvite.builder()
        .inviter(inviter)
        .inviteCode(generateCode())
        .status(FriendInviteStatus.PENDING)
        .createdAt(now)
        .expiresAt(now.plusHours(expireHours))
        .build());
  }

  @Transactional
  public void acceptInvite(AuthPrincipal principal, String code) {
    AppUser me = appUserRepository.getRequired(principal.userId());
    FriendInvite invite =
        friendInviteRepository
            .findByInviteCode(code)
            .orElseThrow(() -> ApiException.notFound("invalid_code"));

    validateAcceptable(invite, me);

    AppUser inviter = invite.getInviter();
    linkFriendship(inviter, me);
    linkFriendship(me, inviter);

    invite.accept(me);
    friendInviteRepository.save(invite);
  }

  @Transactional(readOnly = true)
  public List<Friendship> listFriends(AuthPrincipal principal) {
    return friendshipRepository.findAllByUserId(principal.userId());
  }

  private void validateAcceptable(FriendInvite invite, AppUser accepter) {
    if (invite.getStatus() != FriendInviteStatus.PENDING) {
      throw ApiException.conflict("not_pending");
    }
    if (invite.getExpiresAt().isBefore(OffsetDateTime.now())) {
    invite.expire();
    friendInviteRepository.save(invite);
      throw ApiException.conflict("expired");
    }
    if (invite.getInviter().getId().equals(accepter.getId())) {
      throw ApiException.conflict("self_invite");
    }
  }

  @Transactional
  public void sendNudge(AuthPrincipal principal, String receiverNickname, String message) {
    String trimmed = message == null ? "" : message.trim();
    if (trimmed.isEmpty() || trimmed.length() > 50) {
      throw ApiException.badRequest("invalid_message");
    }

    AppUser sender = appUserRepository.getRequired(principal.userId());
    AppUser receiver = appUserRepository.findByNickname(receiverNickname)
        .orElseThrow(() -> ApiException.notFound("user_not_found"));

    if (!friendshipRepository.existsByUserIdAndFriendId(sender.getId(), receiver.getId())) {
      throw ApiException.forbidden("not_friends");
    }

    OffsetDateTime startOfDay = LocalDate.now(KST).atStartOfDay(KST).toOffsetDateTime();
    if (friendNudgeRepository.existsTodayNudge(sender.getId(), receiver.getId(), startOfDay)) {
      throw ApiException.conflict("nudge_daily_limit");
    }

    friendNudgeRepository.save(FriendNudge.builder()
        .sender(sender)
        .receiver(receiver)
        .message(trimmed)
        .sentAt(OffsetDateTime.now())
        .build());

    // 외부 푸시(FCM)는 DB 트랜잭션 밖에서 — 커밋 후 처리(FriendNotifications)
    String senderNickname = sender.getNickname() != null ? sender.getNickname() : "친구";
    eventPublisher.publishEvent(
        new FriendEvents.NudgeSent(receiver.getId(), senderNickname, trimmed));
  }

  /** {@code user → friend} 방향의 친구 관계를 없을 때만 생성한다(멱등). */
  private void linkFriendship(AppUser user, AppUser friend) {
    if (friendshipRepository.existsByUserIdAndFriendId(user.getId(), friend.getId())) {
      return;
    }
    friendshipRepository.save(Friendship.builder()
        .user(user)
        .friend(friend)
        .createdAt(OffsetDateTime.now())
        .build());
  }

  private static String generateCode() {
    byte[] bytes = new byte[INVITE_CODE_BYTES];
    RANDOM.nextBytes(bytes);
    return HEX.formatHex(bytes);
  }
}
