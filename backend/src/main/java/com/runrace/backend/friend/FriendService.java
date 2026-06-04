package com.runrace.backend.friend;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.common.ApiException;
import com.runrace.backend.user.AppUser;
import com.runrace.backend.user.AppUserRepository;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
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

  private final AppUserRepository appUserRepository;
  private final FriendInviteRepository friendInviteRepository;
  private final FriendshipRepository friendshipRepository;
  private final ApplicationEventPublisher eventPublisher;

  @Transactional
  public FriendInvite createInvite(AuthPrincipal principal, int expireHours) {
    AppUser inviter = appUserRepository.getRequired(principal.userId());

    FriendInvite invite = new FriendInvite();
    invite.setInviter(inviter);
    invite.setInviteCode(generateCode());
    invite.setStatus(FriendInviteStatus.PENDING);
    invite.setCreatedAt(OffsetDateTime.now());
    invite.setExpiresAt(OffsetDateTime.now().plusHours(expireHours));
    FriendInvite saved = friendInviteRepository.save(invite);

    eventPublisher.publishEvent(
        new FriendEvents.InviteCreated(inviter.getId(), saved.getInviteCode()));
    return saved;
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

    invite.setStatus(FriendInviteStatus.ACCEPTED);
    invite.setAcceptedUser(me);
    friendInviteRepository.save(invite);

    eventPublisher.publishEvent(
        new FriendEvents.InviteAccepted(inviter.getId(), me.getId(), code));
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
      invite.setStatus(FriendInviteStatus.EXPIRED);
      friendInviteRepository.save(invite);
      throw ApiException.conflict("expired");
    }
    if (invite.getInviter().getId().equals(accepter.getId())) {
      throw ApiException.conflict("self_invite");
    }
  }

  /** {@code user → friend} 방향의 친구 관계를 없을 때만 생성한다(멱등). */
  private void linkFriendship(AppUser user, AppUser friend) {
    if (friendshipRepository.existsByUserIdAndFriendId(user.getId(), friend.getId())) {
      return;
    }
    Friendship friendship = new Friendship();
    friendship.setUser(user);
    friendship.setFriend(friend);
    friendship.setCreatedAt(OffsetDateTime.now());
    friendshipRepository.save(friendship);
  }

  private static String generateCode() {
    byte[] bytes = new byte[INVITE_CODE_BYTES];
    RANDOM.nextBytes(bytes);
    return HEX.formatHex(bytes);
  }
}
