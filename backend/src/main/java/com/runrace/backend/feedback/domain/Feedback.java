package com.runrace.backend.feedback.domain;

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
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "feedback")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Feedback {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(name = "user_display_name", length = 200)
  private String userDisplayName;

  @Column(name = "type", nullable = false, length = 20)
  private String type;

  @Column(name = "title", nullable = false, length = 120)
  private String title;

  @Column(name = "content", nullable = false, columnDefinition = "text")
  private String content;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "image_urls", nullable = false)
  private String imageUrlsJson;

  @Column(name = "status", nullable = false, length = 20)
  private String status;

  @Column(name = "page_url", length = 1000)
  private String pageUrl;

  @Column(name = "user_agent", length = 1000)
  private String userAgent;

  @Column(name = "app_version", length = 50)
  private String appVersion;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  @Column(name = "updated_at", nullable = false)
  private OffsetDateTime updatedAt;

  public static Feedback create(
      UUID userId,
      String userDisplayName,
      String type,
      String title,
      String content,
      String imageUrlsJson,
      String pageUrl,
      String userAgent,
      String appVersion) {
    OffsetDateTime now = OffsetDateTime.now();
    Feedback feedback = new Feedback();
    feedback.userId = userId;
    feedback.userDisplayName = userDisplayName;
    feedback.type = type;
    feedback.title = title;
    feedback.content = content;
    feedback.imageUrlsJson = imageUrlsJson;
    feedback.status = "OPEN";
    feedback.pageUrl = pageUrl;
    feedback.userAgent = userAgent;
    feedback.appVersion = appVersion;
    feedback.createdAt = now;
    feedback.updatedAt = now;
    return feedback;
  }
}
