package com.runrace.backend.challenge.domain;

import com.runrace.backend.user.domain.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "challenge")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class Challenge {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "creator_user_id", nullable = false)
  private AppUser creator;

  @Column(name = "start_at", nullable = false)
  private OffsetDateTime startAt;

  @Column(name = "end_at")
  private OffsetDateTime endAt;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  @Column(name = "title", nullable = false, length = 200)
  private String title;

  @Column(name = "goal_km", nullable = false, precision = 10, scale = 3)
  private BigDecimal goalKm;

  @Column(name = "max_members", nullable = false)
  private Integer maxMembers;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "winner_user_id")
  private AppUser winner;

  @Builder.Default
  @Column(name = "is_ended", nullable = false)
  private boolean isEnded = false;

  @Builder.Default
  @Enumerated(EnumType.STRING)
  @Column(name = "prize_award_type", nullable = false, length = 20)
  private PrizeAwardType prizeAwardType = PrizeAwardType.RANK;

  @Column(name = "prize_drawn_at")
  private OffsetDateTime prizeDrawnAt;

  /** 생성 시점 작성자 UI 언어로 고정. 공개 목록 언어별 필터에 사용한다(번역 아님). */
  @Builder.Default
  @Column(name = "lang_cd", nullable = false, length = 5)
  private String langCd = "ko";

  /** 내기(페널티/보상) 텍스트 — 선택값(null 가능). 강제·정산 없이 화면 표시용. */
  @Column(name = "stake", length = 30)
  private String stake;

  /**
   * 크루 내부 레이스면 소속 크루 id — 해당 크루 멤버만 참가 가능, 공개 목록 제외.
   * null이면 일반(공개) 레이스. 크루 해체 시 DB가 null로 풀어 일반 레이스로 남긴다.
   */
  @Column(name = "crew_id")
  private Long crewId;

  // ── 도메인 메서드 ──────────────────────────────────────────────

  /** 주어진 사용자가 이 레이스의 방장(생성자)인지 여부. */
  public boolean isOwner(UUID userId) {
    return userId != null && creator.getId().equals(userId);
  }

  /** 방 속성 일괄 수정 (제목·목표·정원·기간·내기). 수정 API 경로에서만 사용한다. */
  public void updateRoom(String title, BigDecimal goalKm, int maxMembers,
                          OffsetDateTime startAt, OffsetDateTime endAt, String stake) {
    this.title = title;
    this.goalKm = goalKm;
    this.maxMembers = maxMembers;
    this.startAt = startAt;
    this.endAt = endAt;
    this.stake = stake;
  }

  /**
   * 최초 완주자를 승자로 확정한다. 이미 승자가 있으면 무시한다.
   * winner null 체크를 호출자마다 중복하지 않아도 된다.
   */
  public void declareWinner(AppUser user) {
    if (this.winner == null) {
      this.winner = user;
    }
  }

  /** 승자를 초기화한다(운동 삭제·되돌림용). */
  public void clearWinner() {
    this.winner = null;
  }

  /** 레이스을 종료 상태로 전이한다. */
  public void end() {
    this.isEnded = true;
  }

  /** 레이스 종료 상태를 초기화한다(운동 삭제·되돌림용). */
  public void resetEnded() {
    this.isEnded = false;
  }

  public void setPrizeAwardType(PrizeAwardType prizeAwardType) {
    this.prizeAwardType = prizeAwardType == null ? PrizeAwardType.RANK : prizeAwardType;
    this.prizeDrawnAt = null;
  }

  public void markPrizeDrawn() {
    if (this.prizeDrawnAt == null) {
      this.prizeDrawnAt = OffsetDateTime.now();
    }
  }
}
