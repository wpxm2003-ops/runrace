package com.runrace.backend.push.domain;

import com.runrace.backend.user.domain.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Table(
    name = "device_token",
    uniqueConstraints =
        @UniqueConstraint(columnNames = {"user_id", "platform", "fcm_token"}))
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class DeviceToken {
  @Id
  @UuidGenerator
  private UUID id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "user_id", nullable = false)
  private AppUser user;

  @Column(name = "platform", nullable = false, length = 20)
  private String platform;

  @Column(name = "fcm_token", nullable = false, columnDefinition = "text")
  private String fcmToken;

  @Column(name = "updated_at", nullable = false)
  private OffsetDateTime updatedAt;

  // ── 도메인 메서드 ──────────────────────────────────────────────

  /** FCM 토큰을 최신 값으로 갱신하고 업데이트 시각을 기록한다(upsert 업데이트 경로). */
  public void updateToken(String fcmToken, OffsetDateTime updatedAt) {
    this.fcmToken = fcmToken;
    this.updatedAt = updatedAt;
  }
}
