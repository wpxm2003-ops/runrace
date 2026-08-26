package com.runrace.backend.challenge.repository;

import com.runrace.backend.challenge.domain.ChallengeMember;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChallengeMemberRepository
    extends JpaRepository<ChallengeMember, UUID>, ChallengeMemberRepositoryCustom {

  long countByChallengeId(Long challengeId);

  /** 본인(id)을 제외한 미완주 멤버 수 — 전원 완주 판정용(전체 로스터 로드 회피). */
  long countByChallengeIdAndIdNotAndFinishedAtIsNull(Long challengeId, UUID id);

  Optional<ChallengeMember> findByChallengeIdAndUserId(Long challengeId, UUID userId);

  /**
   * 라이브(잠정) 진행률을 갱신한다 — 엔티티를 로드해 save()하면 안 되는 경로다.
   *
   * <p>Hibernate의 기본 UPDATE는 전체 컬럼을 쓰므로, 이 트랜잭션이 읽은 뒤 확정 경로(잠금을
   * 쥔 채 total_km을 올리는 {@code ChallengeProgressService})가 커밋하면 낡은 total_km으로
   * 되돌려 방금 저장한 운동 거리를 지운다. 라이브 경로는 의도적으로 잠금을 잡지 않으므로
   * (표시 전용 값에 레이스 행 잠금은 과하다) 그 경합이 실제로 가능하다.
   *
   * <p>WHERE의 두 조건이 각각 다른 창을 막는다.
   * <ul>
   *   <li>{@code totalKm = :expectedTotalKm} — 이 트랜잭션이 멤버를 읽은 뒤 UPDATE하기 전에
   *       확정 반영이 커밋됐으면 0행이 갱신된다(SELECT~UPDATE 사이).
   *   <li>{@code liveSentAt < :sentAt} — 더 나중에 만들어진 요청이 이미 반영됐으면 떨군다.
   *       핑·일시정지·삭제가 같은 토큰을 쓰므로, 종료 시 보낸 일시정지가 그보다 먼저 만들어진
   *       지각 핑을 무효화한다. 이게 없으면 확정 저장 뒤 도착한 핑이 방금 확정된 거리를 다시
   *       얹고(이중 계상), 일시정지 뒤 도착한 핑이 "러닝 중"을 되살린다.
   * </ul>
   *
   * @return 갱신된 행 수(0이면 확정 반영이 끼어들었거나 더 나중 요청이 이미 반영됐다는 뜻)
   */
  @Modifying(clearAutomatically = false, flushAutomatically = false)
  @Query("update ChallengeMember m "
      + "set m.liveKm = :liveKm, m.liveUpdatedAt = :now, m.livePaused = false, m.liveSentAt = :sentAt "
      + "where m.id = :id and m.totalKm = :expectedTotalKm and m.liveSentAt < :sentAt")
  int updateLiveProgress(
      @Param("id") UUID id,
      @Param("liveKm") BigDecimal liveKm,
      @Param("now") OffsetDateTime now,
      @Param("expectedTotalKm") BigDecimal expectedTotalKm,
      @Param("sentAt") long sentAt);

  /**
   * 확정 반영 시점의 라이브 정리 — 서버 권위 경로 전용이라 순서 토큰을 보지도, 올리지도 않는다.
   *
   * <p>엔티티를 변이해 save하지 않는 이유: {@code @DynamicUpdate}는 <b>로드 스냅샷과 다른</b>
   * 컬럼만 SET에 넣는다. 스냅샷의 live_km이 이미 null이면 null로 덮는 것이 dirty가 아니라
   * SET에서 빠지고, 그 사이 커밋된 핑의 값이 그대로 살아남는다(방금 확정한 거리가 이중 계상).
   * 항상 쓰도록 명시적 UPDATE로 낸다.
   *
   * <p>토큰을 올리지 않는 것은 의도다. 이 경로는 실내런 승인·운동 삭제처럼 <b>진행 중인 다른
   * 런과 무관하게</b> 불릴 수 있어, 올리면 지금 뛰고 있는 런의 다음 핑까지 막는다.
   * 종료 직전에 발신된 지각 핑은 클라이언트가 보내는 일시정지의 더 큰 토큰이 떨군다.
   */
  @Modifying(clearAutomatically = false, flushAutomatically = true)
  @Query("update ChallengeMember m set m.liveKm = null, m.liveUpdatedAt = null, m.livePaused = false "
      + "where m.id = :id")
  int clearLiveOnConfirm(@Param("id") UUID id);

  /**
   * 멤버 한 행을 일시정지 상태로 표시한다 — 거리(live_km)는 그대로 두고 "러닝 중" 표시에서만
   * 뺀다. 지우면 남들 화면에서 진행바가 확정값까지 내려앉았다 재개 때 다시 올라가 버그처럼
   * 보이므로, 쉬는 동안에도 거리는 유지한다. 다음 핑이 오면 자동으로 풀린다.
   *
   * <p>라이브 값이 아직 없는 행에도 토큰은 기록한다 — 그래야 이 일시정지보다 먼저 만들어진
   * 지각 핑이 뒤늦게 도착해 "러닝 중"을 새로 만들어 내지 못한다.
   *
   * <p>사용자 단위 벌크 UPDATE가 아니라 행 단위인 이유: (1) 평생 참여한 모든 레이스 행을
   * 건드릴 이유가 없고, (2) ORDER BY 없는 벌크 UPDATE는 스캔 순서로 잠가서 핑 경로가 지키는
   * id 오름차순 잠금 순서 계약을 깨고 교착을 만든다.
   */
  @Modifying(clearAutomatically = false, flushAutomatically = false)
  @Query("update ChallengeMember m set m.livePaused = true, m.liveSentAt = :sentAt "
      + "where m.id = :id and m.liveSentAt < :sentAt")
  int pauseLiveProgressForMember(@Param("id") UUID id, @Param("sentAt") long sentAt);

  /**
   * 멤버 한 행의 라이브 값만 지운다 — 공유가 꺼진 축의 레이스를 매 핑마다 정리할 때 쓴다.
   *
   * <p>사용자 단위로 지우면 안 된다. 공개는 껐지만 크루는 켠 사용자가 두 레이스에 동시 참여하면,
   * 꺼진 축의 행을 처리하면서 같은 루프에서 방금 갱신한 켜진 축의 값까지 날아간다.
   *
   * <p>이미 비어 있는 행은 건드리지 않는다. 공개 공유는 기본이 꺼짐이라 대다수 사용자가 매 핑마다
   * 이 경로를 타는데, 지울 게 없는데도 토큰만 갱신하면 러닝 내내 무의미한 행 버전(dead tuple)이
   * 90초마다 쌓인다. 건너뛰어도 안전하다 — 값이 없으면 되살아날 것도 없고, 지각 핑 역시 자기
   * 트랜잭션에서 설정을 다시 읽어 같은 분기로 들어온다.
   */
  @Modifying(clearAutomatically = false, flushAutomatically = false)
  @Query("update ChallengeMember m "
      + "set m.liveKm = null, m.liveUpdatedAt = null, m.livePaused = false, m.liveSentAt = :sentAt "
      + "where m.id = :id and m.liveSentAt < :sentAt "
      + "and (m.liveKm is not null or m.liveUpdatedAt is not null or m.livePaused = true)")
  int discardLiveProgressForMember(@Param("id") UUID id, @Param("sentAt") long sentAt);

  /**
   * 사용자의 라이브 값을 서버 판단으로 지운다 — 탈퇴 정리용.
   * 순서 토큰은 보지 않는다 — 클라이언트 시각 고수위를 서버 시각과 비교하면, 시계가 앞선
   * 기기에서는 한 행도 매치되지 않아 정리가 통째로 무효가 된다. 지각 핑으로 값이 되살아나는
   * 창은 조회 시점 게이트(공유 설정·탈퇴 확인)가 닫는다.
   */
  @Modifying(clearAutomatically = false, flushAutomatically = false)
  @Query("update ChallengeMember m "
      + "set m.liveKm = null, m.liveUpdatedAt = null, m.livePaused = false "
      + "where m.user.id = :userId and m.liveUpdatedAt is not null")
  int clearLiveProgressForUser(@Param("userId") UUID userId);

  /**
   * 사용자의 공개(비크루) 레이스 라이브 값을 지운다 — 공개 공유를 껐을 때.
   * 지각 핑으로 값이 되살아나도 조회 시점 게이트가 공유 설정을 직접 보므로 노출되지 않는다.
   * 크루 레이스 값은 남긴다.
   */
  @Modifying(clearAutomatically = false, flushAutomatically = false)
  @Query("update ChallengeMember m "
      + "set m.liveKm = null, m.liveUpdatedAt = null, m.livePaused = false "
      + "where m.user.id = :userId "
      + "and m.challenge.id in (select c.id from Challenge c where c.crewId is null)")
  int clearLiveProgressForUserPublicRaces(@Param("userId") UUID userId);

  /** 사용자의 크루 레이스 라이브 값만 지운다 — 크루 공유를 껐을 때. 공개 레이스 값은 남긴다. */
  @Modifying(clearAutomatically = false, flushAutomatically = false)
  @Query("update ChallengeMember m "
      + "set m.liveKm = null, m.liveUpdatedAt = null, m.livePaused = false "
      + "where m.user.id = :userId "
      + "and m.challenge.id in (select c.id from Challenge c where c.crewId is not null)")
  int clearLiveProgressForUserCrewRaces(@Param("userId") UUID userId);
}
