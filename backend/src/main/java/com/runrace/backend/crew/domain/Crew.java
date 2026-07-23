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
import java.time.LocalDate;
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

  /** 초대 코드 — 크루 홈에서 복사·공유하고, 받는 사람이 크루 온보딩에서 입력해 가입한다. 혼동 문자 제외 6자. */
  @Column(name = "join_code", nullable = false, length = 6)
  private String joinCode;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "leader_user_id", nullable = false)
  private AppUser leader;

  @Column(name = "max_members", nullable = false)
  private int maxMembers;

  /** 크루원 1인당 월간 목표 거리(km) — 매달 반복 적용. null이면 목표 없음. */
  @Column(name = "month_goal_km", precision = 10, scale = 3)
  private BigDecimal monthGoalKm;

  /** 시도 지역 코드(SEOUL/BUSAN/.../ONLINE/ETC) — 발견 목록 필터 기준. 생성 시 필수, 기존 크루는 ETC 백필. */
  @Builder.Default
  @Column(name = "region", nullable = false, length = 20)
  private String region = "ETC";

  /** 대표 이미지 URL(공개). null이면 이미지 없음 — 목록에서 이니셜 플레이스홀더로 대체. */
  @Column(name = "image_url")
  private String imageUrl;

  @Column(name = "image_urls")
  private String imageUrlsJson;

  /** 공개 소개(비회원 대상 발견 목록·상세용). notice(회원 전용 고정공지)와 별개. */
  @Column(name = "intro", length = 500)
  private String intro;

  /** 정기런 장소 자유텍스트(선택). */
  @Column(name = "meetup_place", length = 60)
  private String meetupPlace;

  /** 정기런 요일 CSV(월=0…일=6, 선택) — training_plan.sub_t_days와 동일 규약. */
  @Column(name = "meetup_days", length = 20)
  private String meetupDays;

  /** 정기런 시간 자유텍스트(선택). */
  @Column(name = "meetup_time", length = 30)
  private String meetupTime;

  /** 실제 크루 창설일(선택). null이면 상세 화면에 createdAt을 대신 표시한다. */
  @Column(name = "founded_at")
  private LocalDate foundedAt;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  // ── 도메인 메서드 ──────────────────────────────────────────────

  /** 주어진 사용자가 이 크루의 리더인지 여부. */
  public boolean isLeader(UUID userId) {
    return userId != null && leader.getId().equals(userId);
  }

  /** 이름·공지·월간 목표 수정(리더 전용 경로에서만 호출). */
  public void updateInfo(String notice, BigDecimal monthGoalKm) {
    this.notice = notice;
    this.monthGoalKm = monthGoalKm;
  }

  /**
   * 발견 프로필(지역·이미지·소개·정기런) 수정(리더 전용). 전부 개별 null 허용 —
   * meetup 3종은 각각 독립 선택값이라 하나만 채워도 된다.
   */
  public void updateProfile(
      String region, String imageUrl, String imageUrlsJson, String intro,
      String meetupPlace, String meetupDays, String meetupTime, LocalDate foundedAt) {
    this.region = region;
    this.imageUrl = imageUrl;
    this.imageUrlsJson = imageUrlsJson;
    this.intro = intro;
    this.meetupPlace = meetupPlace;
    this.meetupDays = meetupDays;
    this.meetupTime = meetupTime;
    this.foundedAt = foundedAt;
  }

  /** 리더 승계 — 리더 탈퇴(계정 익명화) 시 가장 오래된 멤버에게 넘긴다. */
  public void transferLeader(AppUser next) {
    this.leader = next;
  }
}
