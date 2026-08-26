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
@Table(name = "users")
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

  /** 사용자의 IANA 시간대. 현지 시각 기준 푸시 발송에 사용한다. */
  @Builder.Default
  @Column(name = "time_zone", nullable = false, length = 64)
  private String timeZone = "Asia/Seoul";

  /**
   * 푸시 알림 수신 선호. 기본 false — 알림을 허용해 '첫' 디바이스 토큰이 등록되는 시점에 true로 전환된다
   * (DeviceTokenService). 끄면 모든 푸시(이벤트·리텐션)를 보내지 않는다.
   */
  @Builder.Default
  @Column(name = "push_enabled", nullable = false)
  private boolean pushEnabled = false;

  /**
   * 공개(비크루) 레이스에서 본인의 실시간(잠정) 진행률을 보여줄지. 기본 true.
   *
   * <p>처음에는 기본 false로 냈다 — 공개 레이스 상세는 모르는 사람도 조회할 수 있어 동의를 받고
   * 시작한다는 판단이었다. 실사용에서 대다수가 설정을 건드리지 않아 기능이 죽은 채로 보이는 게
   * 먼저 드러나 켜짐으로 뒤집었다(V71). 노출 범위 자체는 그대로다 — 인증된 사용자에게만,
   * 종료 전 레이스에서만, 좌표 없이, 15분 미갱신 시 자동 소멸.
   */
  @Builder.Default
  @Column(name = "live_public_opt_in", nullable = false)
  private boolean livePublicOptIn = true;

  /**
   * 크루 내부 레이스에서 본인의 실시간(잠정) 진행률을 보여줄지. 기본 true(허용) —
   * 이미 서로 아는 폐쇄 로스터라 기본은 켜두되, 끌 수 있어야 한다는 원칙은 공개 레이스와 같다.
   */
  @Builder.Default
  @Column(name = "live_crew_enabled", nullable = false)
  private boolean liveCrewEnabled = true;

  /** 탈퇴(익명화) 시각. null=정상 회원. 값이 있으면 개인정보가 제거된 탈퇴 계정. */
  @Column(name = "withdrawn_at")
  private OffsetDateTime withdrawnAt;

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

  public void changeTimeZone(String timeZone) {
    this.timeZone = timeZone;
  }

  /** 푸시 알림 수신 선호 변경(내정보 토글). */
  public void changePushEnabled(boolean pushEnabled) {
    this.pushEnabled = pushEnabled;
  }

  /** 공개 레이스 실시간 진행률 노출 동의 변경(내정보 토글). */
  public void changeLivePublicOptIn(boolean livePublicOptIn) {
    this.livePublicOptIn = livePublicOptIn;
  }

  /** 크루 레이스 실시간 진행률 노출 변경(내정보 토글). */
  public void changeLiveCrewEnabled(boolean liveCrewEnabled) {
    this.liveCrewEnabled = liveCrewEnabled;
  }

  // 탈퇴(익명화) 계정의 닉네임은 null 그대로 내보낸다. 예전에는 서버가 "탈퇴한 러너"를
  // 구워 보냈는데, 그러면 어떤 언어를 쓰든 그 자리만 한국어가 됐다. 프론트는 이 축의 모든
  // 표시 지점에서 이미 `?? t.no_name`(5로케일)로 받고 있고, 크루 축은 원래부터 null을 보낸다.

  /**
   * 탈퇴 익명화 — 개인정보를 제거하고 탈퇴 시각을 기록한다. 레이스 정합성을 위해 행 자체는 보존한다.
   * firebase_uid는 NOT NULL·UNIQUE라 null 대신 tombstone 값으로 대체한다(재로그인 불가).
   */
  public void withdraw(OffsetDateTime now) {
    this.email = null;
    this.displayName = null;
    this.nickname = null;
    this.firebaseUid = "withdrawn:" + this.id;
    this.withdrawnAt = now;
  }
}
