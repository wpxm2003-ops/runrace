package com.runrace.backend.shoe.domain;

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
import java.time.OffsetDateTime;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 신발 — 사용자가 등록한 러닝화. 활성 신발 1개로 이후 러닝이 자동 귀속된다. */
@Entity
@Table(name = "shoe")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class Shoe {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "user_id", nullable = false)
  private AppUser user;

  @Column(name = "brand", nullable = false, length = 40)
  private String brand;

  @Column(name = "model", nullable = false, length = 60)
  private String model;

  @Column(name = "nickname", length = 40)
  private String nickname;

  /** 교체 권장 목표 거리(m). null이면 알림 없음. */
  @Column(name = "target_distance_m")
  private Integer targetDistanceM;

  @Column(name = "is_active", nullable = false)
  private boolean active;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  public void edit(String brand, String model, String nickname, Integer targetDistanceM) {
    this.brand = brand;
    this.model = model;
    this.nickname = nickname;
    this.targetDistanceM = targetDistanceM;
  }

  public void activate() {
    this.active = true;
  }

  public void deactivate() {
    this.active = false;
  }

  /** 푸시·표시용 이름 — 별칭 우선, 없으면 "브랜드 모델". */
  public String displayName() {
    if (nickname != null && !nickname.isBlank()) return nickname;
    return (brand + " " + model).trim();
  }
}
