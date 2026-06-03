package com.runrace.backend.friend;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.user.AppUser;
import com.runrace.backend.user.AppUserRepository;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class FriendService {
  private static final SecureRandom RAND = new SecureRandom();
  private static final HexFormat HEX = HexFormat.of();

  private final AppUserRepository appUserRepository;
  private final FriendInviteRepository friendInviteRepository;
  private final FriendshipRepository friendshipRepository;

  @Transactional
  public FriendInvite createInvite(AuthPrincipal principal, int expireHours) {
    AppUser inviter = appUserRepository.findById(principal.userId()).orElseThrow();

    FriendInvite invite = new FriendInvite();
    invite.setInviter(inviter);
    invite.setInviteCode(generateCode(16));
    invite.setStatus(FriendInviteStatus.PENDING);
    invite.setCreatedAt(OffsetDateTime.now());
    invite.setExpiresAt(OffsetDateTime.now().plusHours(expireHours));
    return friendInviteRepository.save(invite);
  }

  @Transactional
  public AcceptedPair acceptInviteAndReturnPair(AuthPrincipal principal, String code) {
    AppUser me = appUserRepository.findById(principal.userId()).orElseThrow();

    FriendInvite invite =
        friendInviteRepository.findByInviteCode(code).orElseThrow(() -> new IllegalArgumentException("invalid_code"));

    if (invite.getStatus() != FriendInviteStatus.PENDING) {
      throw new IllegalStateException("not_pending");
    }
    if (invite.getExpiresAt().isBefore(OffsetDateTime.now())) {
      invite.setStatus(FriendInviteStatus.EXPIRED);
      friendInviteRepository.save(invite);
      throw new IllegalStateException("expired");
    }
    if (invite.getInviter().getId().equals(me.getId())) {
      throw new IllegalStateException("self_invite");
    }

    UUID inviterId = invite.getInviter().getId();
    UUID meId = me.getId();

    if (!friendshipRepository.existsByUserIdAndFriendId(inviterId, meId)) {
      Friendship f1 = new Friendship();
      f1.setUser(invite.getInviter());
      f1.setFriend(me);
      f1.setCreatedAt(OffsetDateTime.now());
      friendshipRepository.save(f1);
    }
    if (!friendshipRepository.existsByUserIdAndFriendId(meId, inviterId)) {
      Friendship f2 = new Friendship();
      f2.setUser(me);
      f2.setFriend(invite.getInviter());
      f2.setCreatedAt(OffsetDateTime.now());
      friendshipRepository.save(f2);
    }

    invite.setStatus(FriendInviteStatus.ACCEPTED);
    invite.setAcceptedUser(me);
    friendInviteRepository.save(invite);

    return new AcceptedPair(invite.getInviter().getId(), me.getId());
  }

  @Transactional(readOnly = true)
  public List<Friendship> listFriends(AuthPrincipal principal) {
    return friendshipRepository.findAllByUserId(principal.userId());
  }

  private static String generateCode(int bytes) {
    byte[] b = new byte[bytes];
    RAND.nextBytes(b);
    return HEX.formatHex(b);
  }

  public record AcceptedPair(UUID inviterUserId, UUID acceptedUserId) {}
}

