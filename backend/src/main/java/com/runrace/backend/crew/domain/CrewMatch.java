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
 * 크루 대항전 — challenger가 도전장 작성 시 시작/종료일시를 직접 설정한다(레이스 등록과 동일).
 * 목표 없이 항상 기간 내 무제한 — 로스터 합산 거리가 더 큰 쪽이 승리한다.
 * opponent는 시작 전까지만 수락할 수 있고, 수락은 상태 전이만 한다(기간은 이미 확정돼 있음).
 * 종료 확정(승자 기록)은 조회 시점에 lazy로 수행한다.
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

  /** 도전장 작성 시 확정(레이스 등록과 동일 — 상대 수락 여부와 무관하게 고정). */
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

  /** 수락 — 기간은 도전장 작성 시 이미 확정돼 있으므로 상태만 전이한다. */
  public void accept() {
    this.status = Status.ACCEPTED;
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
