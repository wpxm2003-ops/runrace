package com.runrace.backend.challenge.domain;

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

/** 레이스 등수별 경품. 이미지는 S3 비공개 키만 보관(공개 URL 미발급) — 게이트 엔드포인트로만 서빙. */
@Entity
@Table(name = "challenge_prize")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChallengePrize {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "challenge_id", nullable = false)
  private Long challengeId;

  @Column(name = "rank", nullable = false)
  private int rank;

  @Column(name = "name", nullable = false, length = 60)
  private String name;

  /** S3 비공개 객체 키. null이면 이미지 없는 경품(이름만). */
  @Column(name = "image_key", length = 200)
  private String imageKey;

  /** 당첨자 첫 열람 시각(수령 표시). */
  @Column(name = "viewed_at")
  private OffsetDateTime viewedAt;

  @Column(name = "winner_user_id")
  private UUID winnerUserId;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  public static ChallengePrize of(Long challengeId, int rank, String name, String imageKey) {
    ChallengePrize p = new ChallengePrize();
    p.challengeId = challengeId;
    p.rank = rank;
    p.name = name;
    p.imageKey = imageKey;
    p.createdAt = OffsetDateTime.now();
    return p;
  }

  public void markViewed() {
    if (this.viewedAt == null) this.viewedAt = OffsetDateTime.now();
  }

  public void assignWinner(UUID userId) {
    if (this.winnerUserId == null) {
      this.winnerUserId = userId;
    }
  }
}
