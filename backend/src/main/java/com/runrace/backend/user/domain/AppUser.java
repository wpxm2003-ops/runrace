package com.runrace.backend.user.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Table(name = "app_user")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class AppUser {
  @Id
  @UuidGenerator
  private UUID id;

  @Column(name = "firebase_uid", nullable = false, unique = true, length = 128)
  private String firebaseUid;

  @Column(name = "email", length = 320)
  private String email;

  @Column(name = "display_name", length = 200)
  private String displayName;

  @Column(name = "nickname", length = 50)
  private String nickname;

  @Column(name = "provider", length = 50)
  private String provider;

  /** 사용자 언어 선호값(ko/en/es/ja/zh). 푸시 알림을 수신자 언어로 보낼 때 사용. */
  @Builder.Default
  @Column(name = "lang_cd", nullable = false, length = 5)
  private String langCd = "ko";

  /** 푸시 알림 수신 선호. 기본 true. 끄면 모든 푸시(이벤트·리텐션)를 보내지 않는다. */
  @Builder.Default
  @Column(name = "push_enabled", nullable = false)
  private boolean pushEnabled = true;

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;

  // ── 도메인 메서드 ──────────────────────────────────────────────

  /** 소셜 로그인 프로필 정보를 최신 값으로 동기화한다(upsert 업데이트 경로). */
  public void updateProfile(String firebaseUid, String email, String displayName, String provider) {
    this.firebaseUid = firebaseUid;
    this.email = email;
    this.displayName = displayName;
    this.provider = provider;
  }

  /** 닉네임 변경. */
  public void changeNickname(String nickname) {
    this.nickname = nickname;
  }

  /** 언어 선호값 변경. */
  public void changeLangCd(String langCd) {
    this.langCd = langCd;
  }

  /** 푸시 알림 수신 선호 변경(내정보 토글). */
  public void changePushEnabled(boolean pushEnabled) {
    this.pushEnabled = pushEnabled;
  }
}
