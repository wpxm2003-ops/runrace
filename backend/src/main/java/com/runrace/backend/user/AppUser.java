package com.runrace.backend.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Table(name = "app_user")
@Getter
@Setter
@NoArgsConstructor
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
  @Column(name = "lang_cd", nullable = false, length = 5)
  private String langCd = "ko";

  @Column(name = "created_at", nullable = false)
  private OffsetDateTime createdAt;
}

