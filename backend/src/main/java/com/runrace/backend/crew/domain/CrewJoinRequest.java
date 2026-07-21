package com.runrace.backend.crew.domain;

import com.runrace.backend.user.domain.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
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

/**
 * 크루 발견 목록에서의 가입신청 — 초대코드 즉시가입과 별개 경로. 리더가 승인/거부한다.
 * 신청→PENDING, 승인/거부/취소로 종결. 같은 (crew,user)의 동시 PENDING은 DB 부분 유니크로 방지.
 */
@Entity
@Table(name = "crew_join_request")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class CrewJoinRequest {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "crew_id", nullable = false)
  private Crew crew;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "user_id", nullable = false)
  private AppUser user;

  /** 신청 한마디(선택) — 리더의 승인 판단 근거. */
  @Column(name = "message", length = 100)
  private String message;

  @Enumerated(EnumType.STRING)
  @Column(name = "status", nullable = false, length = 10)
  private CrewJoinRequestStatus status;

  /** 거절 사유(선택) — 신청자에게 푸시로 전달. */
  @Column(name = "reject_reason", length = 100)
  private String rejectReason;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  /** 승인/거부/취소 확정 시각. PENDING이면 null. */
  @Column(name = "decided_at")
  private OffsetDateTime decidedAt;

  /** 처리한 리더 id(soft 참조, 감사용). 신청자 본인 취소면 null. */
  @Column(name = "decided_by")
  private UUID decidedBy;

  public static CrewJoinRequest of(Crew crew, AppUser user, String message) {
    CrewJoinRequest req = new CrewJoinRequest();
    req.crew = crew;
    req.user = user;
    req.message = message;
    req.status = CrewJoinRequestStatus.PENDING;
    req.createdAt = OffsetDateTime.now();
    return req;
  }

  // ── 도메인 메서드 ──────────────────────────────────────────────

  public boolean isPending() {
    return status == CrewJoinRequestStatus.PENDING;
  }

  /** 승인 — 리더 id를 감사 기록으로 남긴다. */
  public void approve(UUID leaderId) {
    this.status = CrewJoinRequestStatus.APPROVED;
    this.decidedAt = OffsetDateTime.now();
    this.decidedBy = leaderId;
  }

  /** 거절 — 사유는 선택. 24h 쿨다운은 서비스 계층이 decidedAt 기준으로 판정한다. */
  public void reject(UUID leaderId, String reason) {
    this.status = CrewJoinRequestStatus.REJECTED;
    this.rejectReason = reason;
    this.decidedAt = OffsetDateTime.now();
    this.decidedBy = leaderId;
  }

  /** 신청자 본인 취소, 또는 타 크루 승인으로 인한 시스템 자동취소(decidedBy 없음). */
  public void cancel() {
    this.status = CrewJoinRequestStatus.CANCELED;
    this.decidedAt = OffsetDateTime.now();
  }
}
