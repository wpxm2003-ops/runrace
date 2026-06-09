package com.runrace.backend.challenge;

import com.runrace.backend.user.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "challenge")
@Getter
@Setter
@NoArgsConstructor
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

  @Column(name = "is_ended", nullable = false)
  private boolean isEnded = false;

  /** 생성 시점 작성자 UI 언어로 고정. 공개 목록 언어별 필터에 사용한다(번역 아님). */
  @Column(name = "lang_cd", nullable = false, length = 5)
  private String langCd = "ko";
}
