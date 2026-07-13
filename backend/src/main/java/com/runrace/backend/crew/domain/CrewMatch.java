package com.runrace.backend.crew.domain;

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
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 크루 대항전 — challenger가 opponent에게 도전장을 보내고, 수락 시 다음날 0시(KST) 동시 출발.
 * 점수는 로스터 합산 거리로 파생하며, 종료 확정(승자 기록)은 조회 시점에 lazy로 수행한다.
 */
@Entity
@Table(name = "crew_match")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class CrewMatch {

  public enum Status { PENDING, ACCEPTED, DECLINED }

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "challenger_crew_id", nullable = false)
  private Crew challengerCrew;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "opponent_crew_id", nullable = false)
  private Crew opponentCrew;

  @Builder.Default
  @Enumerated(EnumType.STRING)
  @Column(name = "status", nullable = false, length = 10)
  private Status status = Status.PENDING;

  /** 양 크루 출전 인원(동수 강제) — 도전자가 정하고 상대가 따른다. */
  @Column(name = "roster_size", nullable = false)
  private int rosterSize;

  @Column(name = "duration_days", nullable = false)
  private int durationDays;

  /** 수락 시 확정 — 다음날 0시 KST. PENDING 동안은 null. */
  @Column(name = "start_at")
  private OffsetDateTime startAt;

  @Column(name = "end_at")
  private OffsetDateTime endAt;

  @Builder.Default
  @Column(name = "is_ended", nullable = false)
  private boolean isEnded = false;

  /** 종료 확정 시 승자 크루 id. 무승부·미확정이면 null. */
  @Column(name = "winner_crew_id")
  private Long winnerCrewId;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  // ── 도메인 메서드 ──────────────────────────────────────────────

  /** 수락 — 기간을 확정하고 ACCEPTED로 전이한다. */
  public void accept(OffsetDateTime startAt, OffsetDateTime endAt) {
    this.status = Status.ACCEPTED;
    this.startAt = startAt;
    this.endAt = endAt;
  }

  public void decline() {
    this.status = Status.DECLINED;
  }

  /** 종료 확정 — 승자 크루 기록(무승부면 null). 이미 확정됐으면 무시. */
  public void finish(Long winnerCrewId) {
    if (!this.isEnded) {
      this.isEnded = true;
      this.winnerCrewId = winnerCrewId;
    }
  }

  public boolean involves(Long crewId) {
    return challengerCrew.getId().equals(crewId) || opponentCrew.getId().equals(crewId);
  }
}
