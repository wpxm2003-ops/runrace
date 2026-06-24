package com.runrace.backend.push.domain;

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
@Table(name = "system_push_history")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SystemPushHistory {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private UUID userId;

  @Column(nullable = false, length = 30)
  private String pushType;

  @Column(nullable = false, columnDefinition = "text")
  private String title;

  @Column(nullable = false, columnDefinition = "text")
  private String body;

  @Column(nullable = false)
  private OffsetDateTime sentAt;

  public static SystemPushHistory of(UUID userId, String pushType, String title, String body) {
    SystemPushHistory h = new SystemPushHistory();
    h.userId = userId;
    h.pushType = pushType;
    h.title = title;
    h.body = body;
    h.sentAt = OffsetDateTime.now();
    return h;
  }
}
