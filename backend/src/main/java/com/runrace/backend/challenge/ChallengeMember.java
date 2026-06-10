package com.runrace.backend.challenge;

import com.runrace.backend.user.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;
import org.springframework.lang.Nullable;

@Entity
@Table(name = "challenge_member")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class ChallengeMember {
  @Id
  @UuidGenerator
  private UUID id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "challenge_id", nullable = false)
  private Challenge challenge;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "user_id", nullable = false)
  private AppUser user;

  @Column(name = "total_km", nullable = false, precision = 10, scale = 3)
  private BigDecimal totalKm;

  @Column(name = "last_sync_at")
  private OffsetDateTime lastSyncAt;

  @Column(name = "finished_at")
  private OffsetDateTime finishedAt;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  @Column(name = "joined_at", nullable = false)
  private OffsetDateTime joinedAt;

  @PrePersist
  void onCreate() {
    OffsetDateTime now = OffsetDateTime.now();
    if (createdAt == null) {
      createdAt = now;
    }
    if (joinedAt == null) {
      joinedAt = now;
    }
  }

  // ── 도메인 메서드 ──────────────────────────────────────────────

  /** 누적 거리에 deltaKm를 더하고 마지막 동기화 시각을 갱신한다. */
  public void addDistance(BigDecimal deltaKm, OffsetDateTime now) {
    this.totalKm = this.totalKm.add(deltaKm);
    this.lastSyncAt = now;
  }

  /** 누적 거리를 직접 설정하고 마지막 동기화 시각을 갱신한다(FitnessService 보정용). */
  public void setDistanceAndSync(BigDecimal km, OffsetDateTime now) {
    this.totalKm = km;
    this.lastSyncAt = now;
  }

  /** 완주 시각을 현재 시각으로 기록한다. 이미 완주한 경우 무시한다. */
  public void markFinished(@Nullable OffsetDateTime at) {
    if (this.finishedAt == null) {
      this.finishedAt = at != null ? at : OffsetDateTime.now();
    }
  }

  /** 완주 상태를 초기화한다(운동 삭제·되돌림용). */
  public void resetFinished() {
    this.finishedAt = null;
  }
}
