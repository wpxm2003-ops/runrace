package com.runrace.backend.friend;

import com.runrace.backend.auth.AuthPrincipal;
import com.runrace.backend.friend.dto.CreateInviteRequest;
import com.runrace.backend.friend.dto.CreateInviteResponse;
import com.runrace.backend.friend.dto.FriendResponse;
import com.runrace.backend.friend.dto.NudgeRequest;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/friends")
@RequiredArgsConstructor
public class FriendController {
  private static final int DEFAULT_EXPIRE_HOURS = 48;

  private final FriendService friendService;

  @PostMapping("/invites")
  public ResponseEntity<CreateInviteResponse> createInvite(
      AuthPrincipal principal, @RequestBody(required = false) CreateInviteRequest body) {
    int expireHours =
        body != null && body.expireHours() != null ? body.expireHours() : DEFAULT_EXPIRE_HOURS;
    FriendInvite invite = friendService.createInvite(principal, expireHours);
    return ResponseEntity.ok(
        new CreateInviteResponse(invite.getInviteCode(), invite.getExpiresAt().toString()));
  }

  @PostMapping("/invites/{code}/accept")
  public ResponseEntity<Void> accept(AuthPrincipal principal, @PathVariable("code") String code) {
    friendService.acceptInvite(principal, code);
    return ResponseEntity.ok().build();
  }

  @PostMapping("/{nickname}/nudge")
  public ResponseEntity<Void> nudge(
      AuthPrincipal principal,
      @PathVariable String nickname,
      @RequestBody NudgeRequest body) {
    friendService.sendNudge(principal, nickname, body.message());
    return ResponseEntity.ok().build();
  }

  @GetMapping
  public ResponseEntity<List<FriendResponse>> list(AuthPrincipal principal) {
    List<FriendResponse> friends =
        friendService.listFriends(principal).stream()
            .map(
                friendship ->
                    new FriendResponse(
                        friendship.getFriend().getId(),
                        friendship.getFriend().getNickname(),
                        friendship.getFriend().getPhotoUrl(),
                        friendship.getFriend().getEmail()))
            .toList();
    return ResponseEntity.ok(friends);
  }
}
