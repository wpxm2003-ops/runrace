package com.runrace.backend.nudge;

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
import java.time.LocalDate;
import java.time.OffsetDateTime;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 콕 찌르기(독려) 기록 — 같은 레이스 참가자끼리 보낸다. 일일 중복 방지에 사용한다. */
@Entity
@Table(name = "friend_nudge")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class Nudge {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "sender_id", nullable = false)
  private AppUser sender;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "receiver_id", nullable = false)
  private AppUser receiver;

  @Column(name = "message", nullable = false, length = 50)
  private String message;

  @Column(name = "sent_at", nullable = false)
  private OffsetDateTime sentAt;

  /** 발송 KST 날짜 — (sender, receiver, sent_on) 유니크로 하루 1회를 보장한다. */
  @Column(name = "sent_on", nullable = false)
  private LocalDate sentOn;
}
