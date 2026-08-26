package com.runrace.backend.challenge.domain;

import com.runrace.backend.user.domain.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.DynamicUpdate;
import org.hibernate.annotations.UuidGenerator;
import org.springframework.lang.Nullable;

@Entity
@Table(name = "challenge_member")
/**
 * 변경된 컬럼만 UPDATE한다. 이 엔티티는 서로 다른 축(확정 거리 / 라이브 표시)이 서로 다른
 * 경로에서 갱신되는데, 기본 동작인 전체 컬럼 UPDATE는 SELECT 시점 스냅샷으로 SET을 만들기
 * 때문에 그 사이 다른 경로가 커밋한 값을 조용히 되돌린다.
 *
 * <p>실제로 이 축에서만 세 번 터졌다 — 라이브 핑이 확정 거리를 되돌리고(그래서 라이브 쓰기는
 * 벌크 UPDATE로 뺐다), 운동 삭제·종료 확정이 라이브 값을 되살리고, 확정 저장이 순서 토큰
 * (live_sent_at)을 과거로 되돌려 떨궈야 할 지각 핑을 통과시켰다. 개별 경로마다 막는 대신
 * 여기서 한 번에 닫는다.
 */
@DynamicUpdate
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class ChallengeMember {
  @Id
  @UuidGenerator
  private UUID id;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "challenge_id", nullable = false)
  private Challenge challenge;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "user_id", nullable = false)
  private AppUser user;

  @Column(name = "total_km", nullable = false, precision = 10, scale = 3)
  private BigDecimal totalKm;

  @Column(name = "last_sync_at")
  private OffsetDateTime lastSyncAt;

  @Column(name = "finished_at")
  private OffsetDateTime finishedAt;

  /** 레이스 참가 시각. V18 이전 비방장 데이터는 실제 시각을 알 수 없어 null일 수 있다. */
  @Column(name = "joined_at")
  private OffsetDateTime joinedAt;

  /** 레이스 종료 시 확정되는 최종 순위(1=우승). 진행 중·모집 중이면 null. 전적 도출의 기준값. */
  @Column(name = "final_rank")
  private Integer finalRank;

  /**
   * 러닝 도중(정지·저장 전) 잠정 진행률 — total_km과 분리된 표시 전용 값.
   * 완주·우승자·경품 판정에는 절대 관여하지 않는다. total_km이 확정 반영되는 순간
   * (addDistance 직후) {@link #clearLiveProgress()}로 리셋해 이중합산을 막는다.
   *
   * <p>쓰기 경로가 엔티티에 없는 것은 의도적이다 — 라이브 갱신은 두 컬럼만 건드리는 벌크
   * UPDATE({@code ChallengeMemberRepository#updateLiveProgress})로만 한다. 엔티티를 변경해
   * save()하면 전체 컬럼 UPDATE가 나가 확정 경로가 올린 total_km을 덮어쓸 수 있다.
   */
  @Column(name = "live_km", precision = 10, scale = 3)
  private BigDecimal liveKm;

  @Column(name = "live_updated_at")
  private OffsetDateTime liveUpdatedAt;

  /**
   * 라이브 값이 일시정지 상태인지 — 거리는 유지하되 "러닝 중" 표시에서만 빠진다.
   * 다음 핑이 오면 false로 돌아간다. 자세한 이유는 V70 마이그레이션 코멘트 참조.
   */
  @Builder.Default
  @Column(name = "live_paused", nullable = false)
  private boolean livePaused = false;

  /**
   * 지금까지 반영한 라이브 요청 중 가장 나중에 만들어진 것의 시각(클라이언트 ms).
   *
   * <p>핑·일시정지·삭제가 모두 이 토큰을 들고 오고, 서버는 더 큰 값만 받아들인다. 그래서 셋
   * 사이의 순서가 네트워크 재정렬과 무관하게 고정된다 — 종료 시 보낸 일시정지가 그보다 먼저
   * 만들어진 지각 핑을 자동으로 무효화한다.
   *
   * <p>순서 보정 장치이지 인가 수단이 아니다(요청자가 정하는 값이다). 조작 방어는 목표
   * 상한과 속도 검증이 담당한다. 자세한 배경은 V70 마이그레이션 코멘트 참조.
   */
  @Builder.Default
  @Column(name = "live_sent_at", nullable = false)
  private long liveSentAt = 0;

  /** 라이브 값의 신선도 기준. 이보다 오래되면 표시·응답에서 라이브 없는 것처럼 취급한다. */
  public static final Duration LIVE_FRESH_WINDOW = Duration.ofMinutes(15);

  @PrePersist
  void onCreate() {
    if (joinedAt == null) {
      joinedAt = OffsetDateTime.now();
    }
  }

  // ── 도메인 메서드 ──────────────────────────────────────────────

  /** 누적 거리에 deltaKm를 더하고 마지막 동기화 시각을 갱신한다. */
  public void addDistance(BigDecimal deltaKm, OffsetDateTime now) {
    this.totalKm = this.totalKm.add(deltaKm);
    this.lastSyncAt = now;
  }

  /**
   * 누적 거리를 직접 설정하고 마지막 동기화 시각을 갱신한다.
   * 실사용처는 {@code ChallengeProgressService}의 거리 반영 경로다 — 예전 주석은
   * FitnessService 전용이라고 적어 두어, 그 서비스가 차단된 뒤 죽은 메서드로 오인됐다.
   */
  public void setDistanceAndSync(BigDecimal km, OffsetDateTime now) {
    this.totalKm = km;
    this.lastSyncAt = now;
  }

  /** 완주 시각을 현재 시각으로 기록한다. 이미 완주한 경우 무시한다. */
  public void markFinished(@Nullable OffsetDateTime at) {
    if (this.finishedAt == null) {
      this.finishedAt = at != null ? at : OffsetDateTime.now();
    }
  }

  /** 완주 상태를 초기화한다(운동 삭제·되돌림용). */
  public void resetFinished() {
    this.finishedAt = null;
  }

  /** 종료 시 확정 순위를 기록한다(1=우승). */
  public void assignFinalRank(int rank) {
    this.finalRank = rank;
  }

  /** 확정 순위를 초기화한다(레이스 되돌림용). */
  public void clearFinalRank() {
    this.finalRank = null;
  }

  /**
   * 잠정 진행률을 초기화한다. total_km이 확정 반영되는 시점(addDistance 직후)에 호출해
   * 다음 GET 조회에서 total_km + live_km 이중합산을 막는다(완주·저장 시 필수).
   */
  public void clearLiveProgress() {
    this.liveKm = null;
    this.liveUpdatedAt = null;
    this.livePaused = false;
    // liveSentAt은 건드리지 않는다. 클라이언트 시각으로 래칫되는 값이라 서버 시각으로 올리면
    // 시계가 느린 기기의 다음 런이 스큐만큼 통째로 막힌다(200을 받아 실패도 못 알아챈다).
    // 종료 직전에 발신된 지각 핑은 클라이언트가 보내는 일시정지의 더 큰 토큰이 떨군다.
  }

  /**
   * 이 멤버의 라이브 값을 남에게 보여줘도 되는지 — <b>조회 시점</b>에 설정을 직접 확인한다.
   *
   * <p>쓰기 시점 게이트만 두면 설정을 끄기 직전에 발신된 핑이 뒤늦게 값을 되살릴 수 있고,
   * 그때 정리 쿼리는 이미 지나간 뒤라 신선도 윈도(15분) 내내 노출된다. 설정은 사건이 아니라
   * 상태이므로 읽을 때 보는 것이 순서 문제에 영향받지 않는 유일한 방법이다.
   */
  public boolean sharesLive(boolean isCrewRace) {
    if (user == null || user.getWithdrawnAt() != null) {
      return false;
    }
    return isCrewRace ? user.isLiveCrewEnabled() : user.isLivePublicOptIn();
  }

  /**
   * 라이브 값이 유효한지 — 값이 있고 {@link #LIVE_FRESH_WINDOW} 이내로 갱신됐을 때만 true.
   * 신선하지 않으면 라이브가 없는 것으로 취급한다.
   *
   * <p>두 컬럼을 함께 본다. "러닝 중" 뱃지·집계와 거리 합산이 서로 다른 기준을 쓰면 한쪽만
   * null인 상태에서 "뛰는 중인데 거리는 0"처럼 어긋난다.
   */
  public boolean isLiveFresh(OffsetDateTime now) {
    return liveKm != null
        && liveUpdatedAt != null
        && !liveUpdatedAt.isBefore(now.minus(LIVE_FRESH_WINDOW));
  }

  /**
   * 지금 실제로 달리는 중인지 — "러닝 중" 뱃지와 인원 집계의 단일 출처.
   * 일시정지 중이면 거리({@link #effectiveTotalKm})는 유지되지만 여기서는 빠진다.
   */
  public boolean isLiveRunning(OffsetDateTime now) {
    return isLiveFresh(now) && !livePaused;
  }

  /**
   * 신선한 라이브 값이 있으면 total_km + live_km, 아니면 total_km 그대로.
   * GET 상세 응답과 라이벌 갭 계산이 공유하는 "현재 최선값" 단일 출처.
   * 일시정지 여부는 보지 않는다 — 쉬는 동안 진행바가 내려앉으면 버그처럼 보인다.
   */
  public BigDecimal effectiveTotalKm(OffsetDateTime now) {
    return isLiveFresh(now) ? totalKm.add(liveKm) : totalKm;
  }
}
