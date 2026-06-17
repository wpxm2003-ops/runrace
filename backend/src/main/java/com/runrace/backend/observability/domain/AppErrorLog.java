package com.runrace.backend.observability.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

/** 프론트엔드·백엔드 에러를 한 곳에 모아 Adminer 등으로 조회하기 위한 로그 행. */
@Entity
@Table(name = "app_error_log")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class AppErrorLog {
  @Id
  @UuidGenerator
  private UUID id;

  @Column(name = "source", nullable = false, length = 20)
  private String source;

  @Column(name = "message", nullable = false, columnDefinition = "text")
  private String message;

  @Column(name = "stack", columnDefinition = "text")
  private String stack;

  @Column(name = "context", columnDefinition = "text")
  private String context;

  /** app_user에 대한 soft 참조(FK 없음). 비로그인 보고는 null. */
  @Column(name = "user_id")
  private UUID userId;

  @Column(name = "request_id", length = 64)
  private String requestId;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;
}
