package com.runrace.backend.fitness;

import com.runrace.backend.user.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Table(name = "daily_distance")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class DailyDistance {
  @Id
  @UuidGenerator
  private UUID id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "user_id", nullable = false)
  private AppUser user;

  @Column(name = "date", nullable = false)
  private LocalDate date;

  @Column(name = "source", nullable = false, length = 30)
  private String source;

  @Column(name = "distance_km", nullable = false, precision = 10, scale = 3)
  private BigDecimal distanceKm;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  @Column(name = "updated_at", nullable = false)
  private OffsetDateTime updatedAt;

  // ── 도메인 메서드 ──────────────────────────────────────────────

  /** 동일 소스·날짜의 거리를 새 값으로 갱신한다(upsert 업데이트 경로). */
  public void updateDistance(BigDecimal distanceKm, OffsetDateTime updatedAt) {
    this.distanceKm = distanceKm;
    this.updatedAt = updatedAt;
  }
}
