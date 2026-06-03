package com.runrace.backend.friend;

import com.runrace.backend.auth.AuthContext;
import com.runrace.backend.auth.AuthPrincipal;
import java.util.List;
import java.util.UUID;
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
  private final FriendService friendService;
  private final com.runrace.backend.push.PushService pushService;
  private final com.runrace.backend.analytics.AnalyticsService analyticsService;
  private final com.runrace.backend.user.AppUserRepository appUserRepository;

  @PostMapping("/invites")
  public ResponseEntity<CreateInviteResponse> createInvite(@RequestBody(required = false) CreateInviteRequest body) {
    AuthPrincipal principal = AuthContext.getRequired();
    int expireHours = body != null && body.expireHours() != null ? body.expireHours() : 48;
    FriendInvite invite = friendService.createInvite(principal, expireHours);
    var me = appUserRepository.findById(principal.userId()).orElseThrow();
    analyticsService.track(me, "friend_invite.created", "{\"code\":\"" + invite.getInviteCode() + "\"}");
    // MVP: 초대 생성은 상대를 특정할 수 없어 푸시는 생략(링크 공유로 대체)
    return ResponseEntity.ok(new CreateInviteResponse(invite.getInviteCode(), invite.getExpiresAt().toString()));
  }

  @PostMapping("/invites/{code}/accept")
  public ResponseEntity<Void> accept(@PathVariable("code") String code) {
    AuthPrincipal principal = AuthContext.getRequired();
    var ids = friendService.acceptInviteAndReturnPair(principal, code);
    var me = appUserRepository.findById(principal.userId()).orElseThrow();
    analyticsService.track(me, "friend_invite.accepted", "{\"code\":\"" + code + "\"}");
    pushService.sendToUserTokens(ids.inviterUserId(), "RunRace", "친구 초대가 수락됐어요.");
    return ResponseEntity.ok().build();
  }

  @GetMapping
  public ResponseEntity<List<FriendResponse>> list() {
    AuthPrincipal principal = AuthContext.getRequired();
    List<FriendResponse> friends =
        friendService.listFriends(principal).stream()
            .map(f -> new FriendResponse(
                f.getFriend().getId(),
                f.getFriend().getDisplayName(),
                f.getFriend().getPhotoUrl(),
                f.getFriend().getEmail()
            ))
            .toList();
    return ResponseEntity.ok(friends);
  }

  public record CreateInviteRequest(Integer expireHours) {}

  public record CreateInviteResponse(String code, String expiresAt) {}

  public record FriendResponse(UUID id, String displayName, String photoUrl, String email) {}
}

