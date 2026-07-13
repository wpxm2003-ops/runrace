package com.runrace.backend.crew.domain;

import com.runrace.backend.user.domain.AppUser;
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
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 크루 — 러닝크루 소속 단위(사용자당 1개). 리더 한 명이 이름·공지·멤버를 관리한다. */
@Entity
@Table(name = "crew")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class Crew {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "name", nullable = false, length = 20)
  private String name;

  /** 리더가 설정하는 고정 공지 한 줄(정모 일정 등). 채팅 대체가 아니라 설정값. */
  @Column(name = "notice", length = 100)
  private String notice;

  /** 초대 링크(/crew/join?code=...)에 쓰이는 고유 코드. 혼동 문자를 제외한 6자. */
  @Column(name = "join_code", nullable = false, length = 6)
  private String joinCode;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "leader_user_id", nullable = false)
  private AppUser leader;

  @Column(name = "max_members", nullable = false)
  private int maxMembers;

  /** 주간 크루 목표 거리(km) — 매주 반복 적용. null이면 목표 없음. */
  @Column(name = "week_goal_km", precision = 10, scale = 3)
  private BigDecimal weekGoalKm;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  // ── 도메인 메서드 ──────────────────────────────────────────────

  /** 주어진 사용자가 이 크루의 리더인지 여부. */
  public boolean isLeader(UUID userId) {
    return userId != null && leader.getId().equals(userId);
  }

  /** 이름·공지·주간 목표 수정(리더 전용 경로에서만 호출). */
  public void updateInfo(String name, String notice, BigDecimal weekGoalKm) {
    this.name = name;
    this.notice = notice;
    this.weekGoalKm = weekGoalKm;
  }

  /** 리더 승계 — 리더 탈퇴(계정 익명화) 시 가장 오래된 멤버에게 넘긴다. */
  public void transferLeader(AppUser next) {
    this.leader = next;
  }
}
