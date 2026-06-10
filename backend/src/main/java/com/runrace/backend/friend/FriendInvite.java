package com.runrace.backend.friend;

import com.runrace.backend.user.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Table(name = "friend_invite")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class FriendInvite {
  @Id
  @UuidGenerator
  private UUID id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "inviter_user_id", nullable = false)
  private AppUser inviter;

  @Column(name = "invite_code", nullable = false, unique = true, length = 64)
  private String inviteCode;

  @Enumerated(EnumType.STRING)
  @Column(name = "status", nullable = false, length = 20)
  private FriendInviteStatus status;

  @Column(name = "expires_at", nullable = false)
  private OffsetDateTime expiresAt;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "accepted_user_id")
  private AppUser acceptedUser;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  // ── 도메인 메서드 ──────────────────────────────────────────────

  /** 초대를 수락한다. 수락자를 기록하고 상태를 ACCEPTED로 전이한다. */
  public void accept(AppUser accepter) {
    this.status = FriendInviteStatus.ACCEPTED;
    this.acceptedUser = accepter;
  }

  /** 만료 처리. 상태를 EXPIRED로 전이한다. */
  public void expire() {
    this.status = FriendInviteStatus.EXPIRED;
  }
}
