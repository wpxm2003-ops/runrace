package com.runrace.backend.auth.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "user_login_history")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserLoginHistory {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(name = "logged_in_at", nullable = false)
  private OffsetDateTime loggedInAt;

  @Column(name = "provider", length = 50)
  private String provider;

  @Column(name = "platform", length = 30)
  private String platform;

  @Column(name = "user_agent", length = 500)
  private String userAgent;

  public static UserLoginHistory of(
      UUID userId, String provider, String platform, String userAgent) {
    UserLoginHistory history = new UserLoginHistory();
    history.userId = userId;
    history.loggedInAt = OffsetDateTime.now();
    history.provider = bounded(provider, 50);
    history.platform = bounded(platform, 30);
    history.userAgent = bounded(userAgent, 500);
    return history;
  }

  private static String bounded(String value, int maxLength) {
    if (value == null || value.isBlank()) return null;
    String trimmed = value.trim();
    return trimmed.length() <= maxLength ? trimmed : trimmed.substring(0, maxLength);
  }
}
